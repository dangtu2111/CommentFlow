import { z } from 'zod';
import type { RateHoldReason } from '../recheck';
import { replyFingerprint } from '../variation';
import type { SendRateConfig } from './send-rate-config';
import { type SendRateCounter, sendRateKey } from './send-rate-counter';
import { evaluateSendRate, type SendRateBlock } from './send-rate-limit';

/**
 * Dịch vụ giới hạn tốc độ gửi (FR-114): dựng đầu vào `rate` cho R9 của `sendRecheck` từ bộ đếm, và ghi lại
 * một câu đã gửi. Cờ tắt → `snapshot` trả `null` (R9 cho qua như trước). Bộ đếm lỗi → ĐÓNG: `remaining: 0`
 * (hoãn job, thử lại) — không bao giờ cho qua khi không đo được. Nội dung câu chỉ vào bộ đếm dưới dạng sha256.
 */
const MINUTE = 60_000;
const TEN_MINUTES = 10 * MINUTE;
const HOUR = 60 * MINUTE;

const targetSchema = z.object({
  workspaceId: z.string().min(1),
  pageId: z.string().min(1),
  postId: z.string().min(1).nullish(),
  mode: z.enum(['human', 'auto']),
  replyText: z.string(),
  now: z.date(),
});
export type SendRateTarget = z.input<typeof targetSchema>;

export type SendRateSnapshot = { remaining: number; hold?: RateHoldReason };

export type SendRateService = {
  snapshot(target: SendRateTarget): Promise<SendRateSnapshot | null>;
  /** Gọi SAU khi gửi thành công. Không ném (câu đã đi rồi); lỗi báo qua `onError`. */
  record(target: SendRateTarget): Promise<void>;
};

export type SendRateServiceDeps = {
  counter: SendRateCounter;
  config: SendRateConfig;
  /** Mức dùng Meta App hiện tại (0–100) hoặc `null`; mặc định không có thông tin. */
  appUsage?: () => number | null;
  /** Mức "tăng đột biến" (docs/09 §11.2): giảm nửa tốc độ. */
  halved?: (workspaceId: string) => boolean;
  onError?: (error: unknown) => void;
};

const HOLD_REASON: Partial<Record<SendRateBlock, RateHoldReason>> = {
  page_auto_hour: 'rate_limited_page_auto',
  post_auto_10m: 'rate_limited_post',
  repeat_content: 'rate_limited_repeat',
  app_usage: 'rate_limited_app',
};

type Parsed = z.output<typeof targetSchema>;

function keysFor(t: Parsed) {
  const fingerprint = replyFingerprint(t.replyText);
  return {
    page: sendRateKey(t.workspaceId, 'page', t.pageId),
    pageAuto: sendRateKey(t.workspaceId, 'page_auto', t.pageId),
    post: t.postId ? sendRateKey(t.workspaceId, 'post_auto', t.postId) : null,
    repeat: sendRateKey(t.workspaceId, 'repeat', `${t.pageId}-${fingerprint}`),
  };
}

export function createSendRateService(deps: SendRateServiceDeps): SendRateService {
  const { counter, config } = deps;
  const report = (error: unknown) => deps.onError?.(error);

  async function snapshot(raw: SendRateTarget): Promise<SendRateSnapshot | null> {
    if (!config.enabled) return null;
    const parsed = targetSchema.safeParse(raw);
    if (!parsed.success) return { remaining: 0 };
    const t = parsed.data;
    try {
      const k = keysFor(t);
      const [pageMinute, pageHour, pageAutoHour, postAuto10m, repeatHour] = await Promise.all([
        counter.count(k.page, MINUTE, t.now),
        counter.count(k.page, HOUR, t.now),
        counter.count(k.pageAuto, HOUR, t.now),
        k.post === null ? Promise.resolve(0) : counter.count(k.post, TEN_MINUTES, t.now),
        counter.count(k.repeat, HOUR, t.now),
      ]);
      const decision = evaluateSendRate(
        {
          mode: t.mode,
          counts: { pageMinute, pageHour, pageAutoHour, postAuto10m, repeatHour },
          appUsagePercent: deps.appUsage?.() ?? null,
          halved: deps.halved?.(t.workspaceId) ?? false,
        },
        config.limits,
      );
      const hold = decision.block === null ? undefined : HOLD_REASON[decision.block];
      return hold === undefined
        ? { remaining: decision.outcome === 'allow' ? decision.remaining : 0 }
        : { remaining: decision.remaining, hold };
    } catch (error) {
      report(error);
      return { remaining: 0 };
    }
  }

  async function record(raw: SendRateTarget): Promise<void> {
    if (!config.enabled) return;
    const parsed = targetSchema.safeParse(raw);
    if (!parsed.success) return;
    const t = parsed.data;
    try {
      const k = keysFor(t);
      const writes = [counter.record(k.page, t.now), counter.record(k.repeat, t.now)];
      if (t.mode === 'auto') {
        writes.push(counter.record(k.pageAuto, t.now));
        if (k.post !== null) writes.push(counter.record(k.post, t.now));
      }
      await Promise.all(writes);
    } catch (error) {
      report(error);
    }
  }

  return { snapshot, record };
}
