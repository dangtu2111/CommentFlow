import { type ChannelRef, isPlatformError } from '@flow/connectors';
import type { PostHydration } from '@flow/db';
import type { Logger } from '../logger';

/**
 * POST-HYDRATE: bài tạo từ webhook chỉ có mã ngoài; sau khi ingest lưu xong, lấy nội dung bài từ nền tảng (`fetchPost`) và điền các ô còn trống.
 * LÀM TỐT NHẤT CÓ THỂ: không bao giờ ném (lỗi mạng/token/quyền chỉ ghi cảnh báo kèm MÃ lỗi, không kèm nội dung), không làm hỏng ingest — bình luận đã
 * lưu, bài vẫn hiện với mã ngoài như trước. Mỗi bài mới đúng MỘT lần thử; không có tracking nên bài lỗi không tự thử lại (gap ghi ở gap-matrix).
 */
export type HydrateTarget = {
  workspaceId: string;
  channelId: string;
  /** ID ngoài của Page (để dựng `ChannelRef`). */
  channelExternalId: string;
  postId: string;
  postExternalId: string;
};

/** Giới hạn độ dài nội dung bài lưu (bài dài bất thường bị cắt; cột `text` không giới hạn nhưng inbox chỉ cần phần đầu). */
export const MAX_POST_MESSAGE_CHARS = 5000;

export function createPostHydrator(deps: {
  fetchPost: (channel: ChannelRef, postExternalId: string) => Promise<PostHydration>;
  save: (target: HydrateTarget, info: PostHydration) => Promise<boolean>;
  logger: Pick<Logger, 'warn'>;
}): (target: HydrateTarget) => Promise<void> {
  return async (target) => {
    try {
      const info = await deps.fetchPost(
        {
          id: target.channelId,
          workspaceId: target.workspaceId,
          platform: 'facebook',
          externalId: target.channelExternalId,
        },
        target.postExternalId,
      );
      await deps.save(target, {
        ...info,
        message: info.message ? info.message.slice(0, MAX_POST_MESSAGE_CHARS) : null,
      });
    } catch (error) {
      deps.logger.warn(
        { postId: target.postId, error: isPlatformError(error) ? error.code : 'unknown' },
        'không lấy được nội dung bài từ nền tảng',
      );
    }
  };
}
