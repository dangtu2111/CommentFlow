import {
  type ChannelRef,
  isPlatformError,
  MEDIA_UPLOAD_FAILED,
  type PostMedia,
} from '@flow/connectors';
import type { ClaimedPublishTarget, PublishOutcome } from '@flow/db';
import type { Logger } from '../logger';
import { MediaUnavailableError } from './publish-media';

/**
 * POST-PUBLISHING (Q-PUB1): job quét đăng bài đã đến hạn. Cứ 20 giây, với từng workspace có bài đến hạn (không Dừng khẩn cấp): NHẬN mục tiêu (DB thuê + tăng `attempts` TRƯỚC khi gọi nền tảng),
 * đăng chữ lên Fanpage bằng token Page đã lưu, ghi kết quả. Đây là hành động hướng ra ngoài nên theo nguyên tắc TỐI ĐA MỘT LẦN:
 *   - Chắc chắn CHƯA đăng (thiếu quyền, token hết hạn, nội dung bị từ chối trước khi gửi) → `failed` kèm MÃ.
 *   - Giới hạn tốc độ (nền tảng từ chối, chưa đăng) → `retry`, tối đa 3 lần rồi `failed`.
 *   - Mọi kết quả khác (lỗi mạng sau khi gửi, phản hồi thiếu id, lỗi lạ) → `unknown`, KHÔNG BAO GIỜ tự thử lại: có thể ĐÃ đăng, Owner kiểm trên Facebook.
 * Không bao giờ ném (lỗi một mục tiêu/workspace không dừng cái khác). Nhật ký chỉ có số đếm và mã — KHÔNG nội dung bài, id kênh/Page/bài.
 */
export const PUBLISH_SWEEP_INTERVAL_MS = 20_000;
export const PUBLISH_PERMISSION = 'pages_manage_posts';
export const PUBLISH_BATCH = 10;
export const PUBLISH_MAX_WORKSPACES = 50;
/** Tổng số lần thử tối đa của một mục tiêu bị giới hạn tốc độ (khớp `attempts < 3` ở hàm nhận việc của DB). */
export const PUBLISH_MAX_ATTEMPTS = 3;

export type PublishSweepResult = {
  claimed: number;
  published: number;
  failed: number;
  unknown: number;
  retried: number;
};

export type PublishSweepDeps = {
  listDueWorkspaces: () => Promise<string[]>;
  claim: (workspaceId: string) => Promise<ClaimedPublishTarget[]>;
  record: (
    workspaceId: string,
    targetId: string,
    outcome: PublishOutcome,
    detail: { externalPostId?: string; error?: string },
  ) => Promise<boolean>;
  publish: (
    channel: ChannelRef,
    text: string,
    media?: PostMedia,
  ) => Promise<{ externalId: string }>;
  /** Tải ảnh/video của bài từ kho (`undefined` = bài không có file). Lỗi → `MediaUnavailableError` (chắc chắn chưa đăng). */
  loadMedia: (workspaceId: string, postId: string) => Promise<PostMedia | undefined>;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
};

/** Thông điệp của connector khi từ chối TRƯỚC khi gọi mạng (chắc chắn chưa đăng). */
const REJECTED_BEFORE_SEND = new Set(['facebook_invalid_post', 'facebook_invalid_id']);

type Decision = { outcome: PublishOutcome; error: string };

/** Phân loại lỗi đăng bài. Mặc định (không chắc chắn) là `unknown` — KHÔNG BAO GIỜ suy ra "chưa đăng" khi không chắc. */
function decide(error: unknown, attempts: number): Decision {
  // Kho không có/không đọc được file: xảy ra TRƯỚC khi gọi Facebook → chắc chắn chưa đăng.
  if (error instanceof MediaUnavailableError)
    return { outcome: 'failed', error: 'media_unavailable' };
  if (isPlatformError(error)) {
    if (error.code === 'PERMISSION') return { outcome: 'failed', error: 'permission' };
    if (error.code === 'TOKEN_EXPIRED') return { outcome: 'failed', error: 'token_expired' };
    if (error.code === 'RATE_LIMIT') {
      return attempts < PUBLISH_MAX_ATTEMPTS
        ? { outcome: 'retry', error: 'rate_limited' }
        : { outcome: 'failed', error: 'rate_limited' };
    }
    if (error.message === MEDIA_UPLOAD_FAILED) {
      // Tải ảnh lên Page lỗi (ảnh để chưa đăng) → chắc chắn chưa có bài công khai.
      return { outcome: 'failed', error: 'media_upload_failed' };
    }
    if (REJECTED_BEFORE_SEND.has(error.message))
      return { outcome: 'failed', error: 'invalid_post' };
  }
  return { outcome: 'unknown', error: 'unknown_result' };
}

async function publishOne(
  deps: PublishSweepDeps,
  workspaceId: string,
  claimed: ClaimedPublishTarget,
  result: PublishSweepResult,
): Promise<void> {
  const bump = (outcome: PublishOutcome) => {
    if (outcome === 'published') result.published += 1;
    else if (outcome === 'failed') result.failed += 1;
    else if (outcome === 'retry') result.retried += 1;
    else result.unknown += 1;
  };
  if (!claimed.scopes.includes(PUBLISH_PERMISSION)) {
    await deps.record(workspaceId, claimed.targetId, 'failed', { error: 'missing_permission' });
    bump('failed');
    return;
  }
  try {
    const media = await deps.loadMedia(workspaceId, claimed.postId);
    const channel: ChannelRef = {
      id: claimed.channelId,
      workspaceId,
      platform: 'facebook',
      externalId: claimed.channelExternalId,
    };
    const created = media
      ? await deps.publish(channel, claimed.message, media)
      : await deps.publish(channel, claimed.message);
    await deps.record(workspaceId, claimed.targetId, 'published', {
      externalPostId: created.externalId,
    });
    bump('published');
  } catch (error) {
    const decision = decide(error, claimed.attempts);
    deps.logger.warn(
      { outcome: decision.outcome, error: decision.error },
      'đăng bài lên Facebook không thành công',
    );
    await deps.record(workspaceId, claimed.targetId, decision.outcome, { error: decision.error });
    bump(decision.outcome);
  }
}

export async function runPublishSweep(deps: PublishSweepDeps): Promise<PublishSweepResult> {
  const result: PublishSweepResult = {
    claimed: 0,
    published: 0,
    failed: 0,
    unknown: 0,
    retried: 0,
  };
  let workspaces: string[];
  try {
    workspaces = await deps.listDueWorkspaces();
  } catch (error) {
    deps.logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'publish-sweep: không liệt kê được workspace đến hạn',
    );
    return result;
  }
  for (const workspaceId of workspaces) {
    try {
      const claimed = await deps.claim(workspaceId);
      result.claimed += claimed.length;
      for (const item of claimed) {
        try {
          await publishOne(deps, workspaceId, item, result);
        } catch (error) {
          // Ghi kết quả lỗi (DB) sau khi ĐÃ gọi nền tảng: để mục tiêu ở `publishing`; thuê hết hạn sẽ chuyển `unknown`, không đăng lại.
          deps.logger.error(
            { error: error instanceof Error ? error.name : 'unknown' },
            'publish-sweep: lỗi ghi kết quả',
          );
        }
      }
    } catch (error) {
      deps.logger.error(
        { error: error instanceof Error ? error.name : 'unknown' },
        'publish-sweep: lỗi nhận việc của một workspace',
      );
    }
  }
  return result;
}

export function startPublishSweep(deps: PublishSweepDeps): () => void {
  let running = false;
  const tick = () => {
    if (running) return; // không chồng hai lượt quét
    running = true;
    runPublishSweep(deps)
      .then(
        (r) => {
          if (r.claimed > 0) deps.logger.info(r, 'publish-sweep xong');
        },
        (error) =>
          deps.logger.error(
            { error: error instanceof Error ? error.name : 'unknown' },
            'publish-sweep lỗi',
          ),
      )
      .finally(() => {
        running = false;
      });
  };
  tick();
  const timer = setInterval(tick, PUBLISH_SWEEP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
