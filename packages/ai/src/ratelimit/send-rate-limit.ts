import { z } from 'zod';

/**
 * Giới hạn tốc độ gửi (FR-114, docs/09 §11.1). Hàm thuần: đầu vào là số đếm ĐÃ ĐO (bộ đếm do nơi gọi cấp),
 * không Redis/DB/mạng. Chạm ngưỡng = đã hết lượt (đã gửi N câu thì câu N+1 bị chặn).
 *
 * - Page (mọi câu gửi, kể cả do người bấm): 30/phút, 600/giờ → `defer` (hoãn job, không tính lỗi).
 * - Riêng tự gửi: 60/giờ/Page, 20/10 phút/bài, ≤ 5 câu giống hệt/giờ/Page → `hold` (về "Chờ duyệt").
 * - Mức dùng Meta App: ≥ 75% giảm NỬA mọi giới hạn của tự gửi; ≥ 90% tự gửi bị hoãn (chỉ câu do người bấm đi).
 * Đầu vào hỏng → `defer` (đóng, không bao giờ cho qua).
 */

export type SendRateLimits = {
  pagePerMinute: number;
  pagePerHour: number;
  autoPerHour: number;
  postPer10Min: number;
  repeatPerHour: number;
};

export const DEFAULT_SEND_RATE_LIMITS: SendRateLimits = Object.freeze({
  pagePerMinute: 30,
  pagePerHour: 600,
  autoPerHour: 60,
  postPer10Min: 20,
  repeatPerHour: 5,
});

/** Ngưỡng mức dùng Meta App (%), docs/09 §11.1. */
export const APP_USAGE_SLOW_PERCENT = 75;
export const APP_USAGE_HUMAN_ONLY_PERCENT = 90;

export const SEND_RATE_BLOCKS = [
  'page_minute',
  'page_hour',
  'page_auto_hour',
  'post_auto_10m',
  'repeat_content',
  'app_usage',
  'input',
] as const;
export type SendRateBlock = (typeof SEND_RATE_BLOCKS)[number];

const count = z.number().int().min(0);

const sendRateInputSchema = z.object({
  mode: z.enum(['human', 'auto']),
  counts: z.object({
    pageMinute: count,
    pageHour: count,
    pageAutoHour: count,
    postAuto10m: count,
    repeatHour: count,
  }),
  /** Mức dùng cao nhất của Meta App (0–100); `null` = không có thông tin → không giảm tốc. */
  appUsagePercent: z.number().min(0).max(100).nullable(),
  /** Đang giảm nửa tốc độ do tăng đột biến (docs/09 §11.2). */
  halved: z.boolean().optional(),
});

export type SendRateInput = z.input<typeof sendRateInputSchema>;

export type SendRateDecision = {
  outcome: 'allow' | 'defer' | 'hold';
  /** Giới hạn đã chạm; `null` khi `allow`. */
  block: SendRateBlock | null;
  /** Lượt còn lại theo hạn mức Page (nuôi R9 của `sendRecheck`); luôn nguyên ≥ 0. */
  remaining: number;
};

const CLOSED: SendRateDecision = Object.freeze({ outcome: 'defer', block: 'input', remaining: 0 });

const halve = (n: number) => Math.max(1, Math.floor(n / 2));

function effectiveLimits(
  limits: SendRateLimits,
  auto: boolean,
  appUsage: number | null,
  halved: boolean,
): SendRateLimits {
  const slow = halved || (appUsage !== null && appUsage >= APP_USAGE_SLOW_PERCENT);
  if (!auto || !slow) return limits;
  return {
    pagePerMinute: halve(limits.pagePerMinute),
    pagePerHour: halve(limits.pagePerHour),
    autoPerHour: halve(limits.autoPerHour),
    postPer10Min: halve(limits.postPer10Min),
    repeatPerHour: limits.repeatPerHour,
  };
}

/** Quyết định cho MỘT câu sắp gửi. `limits` mặc định = docs/09 §11.1. */
export function evaluateSendRate(
  raw: SendRateInput,
  limits: SendRateLimits = DEFAULT_SEND_RATE_LIMITS,
): SendRateDecision {
  const parsed = sendRateInputSchema.safeParse(raw);
  if (!parsed.success) return CLOSED;
  const { mode, counts, appUsagePercent, halved } = parsed.data;
  const auto = mode === 'auto';
  const lim = effectiveLimits(limits, auto, appUsagePercent, halved === true);

  const minuteLeft = Math.max(0, lim.pagePerMinute - counts.pageMinute);
  const hourLeft = Math.max(0, lim.pagePerHour - counts.pageHour);
  const remaining = Math.min(minuteLeft, hourLeft);

  const defer = (block: SendRateBlock): SendRateDecision => ({
    outcome: 'defer',
    block,
    remaining,
  });
  const hold = (block: SendRateBlock): SendRateDecision => ({ outcome: 'hold', block, remaining });

  if (minuteLeft === 0) return defer('page_minute');
  if (hourLeft === 0) return defer('page_hour');
  if (!auto) return { outcome: 'allow', block: null, remaining };

  if (appUsagePercent !== null && appUsagePercent >= APP_USAGE_HUMAN_ONLY_PERCENT) {
    return defer('app_usage');
  }
  if (counts.pageAutoHour >= lim.autoPerHour) return hold('page_auto_hour');
  if (counts.postAuto10m >= lim.postPer10Min) return hold('post_auto_10m');
  if (counts.repeatHour >= lim.repeatPerHour) return hold('repeat_content');
  return { outcome: 'allow', block: null, remaining };
}
