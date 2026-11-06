import type { AutoSentRecord } from '../history/auto-sent-record';
import { evaluateMarkedWrongSignal } from '../history/marked-wrong-signal';

/**
 * Tự tạm dừng khi bất thường (FR-073, FR-115, US-044, `docs/09` §11.2, Q-AP1). Quy tắc THUẦN: nhận số liệu đã gom
 * sẵn + đồng hồ, trả quyết định; việc ghi cờ/hủy hẹn giờ do `auto-pause-service`, việc đọc số liệu do job `abuse`
 * (ABUSE-JOB) khi nối. Không có tín hiệu nào do AI tự chấm — tất cả là đếm/so sánh bằng code.
 *
 * - Dừng cả workspace: chi phí chạm hạn mức tháng; tỷ lệ Đánh dấu sai > 10% (≥ 10 câu/giờ); gửi lỗi liên tiếp ≥ N.
 * - Tạm khóa KÊNH 24 giờ: lỗi Graph 368 / lỗi chính sách (không dừng cả workspace).
 * - Tăng đột biến > 5× trung bình 7 ngày: chỉ cảnh báo Admin + giảm nửa tốc độ (không dừng).
 */

export const CHANNEL_SUSPEND_MS = 24 * 60 * 60 * 1000;
export const SPIKE_FACTOR = 5;
/** Dưới mức này một đợt tăng không đủ ý nghĩa thống kê (trung bình 7 ngày có thể bằng 0). */
export const SPIKE_MIN_SENT = 20;
export const AUTO_PAUSE_DEFAULTS = { maxConsecutiveSendFailures: 5 } as const;

/** Thứ tự = ưu tiên hiển thị lý do chính. */
export const AUTO_PAUSE_REASONS = [
  'cost_cap_reached',
  'marked_wrong_rate',
  'consecutive_send_failures',
] as const;
export type AutoPauseReason = (typeof AUTO_PAUSE_REASONS)[number];
export type ChannelBlockError = 'graph_368' | 'policy_error';

export type SendOutcome = {
  channelId: string;
  at: Date;
  ok: boolean;
  /** Lỗi chặn kênh (368/chính sách): xử lý ở mức kênh, không tính vào chuỗi lỗi liên tiếp. */
  blockError?: ChannelBlockError;
};

export type AutoPauseConfig = { maxConsecutiveSendFailures: number };

export type AutoPauseInput = {
  /** Câu tự gửi gần đây (cần ít nhất 1 giờ gần nhất). */
  records: readonly AutoSentRecord[];
  /** Kết quả gửi gần đây (cần ít nhất 24 giờ cho lỗi chặn kênh); thứ tự tùy ý. */
  sendOutcomes: readonly SendOutcome[];
  cost: { spentUsd: number; capUsd: number | null };
  spike: { lastHourSent: number; avgHourlySent7d: number };
  config?: AutoPauseConfig;
};

export type AutoPauseDecision = {
  pauseWorkspace: { reason: AutoPauseReason; reasons: AutoPauseReason[] } | null;
  suspendChannels: { channelId: string; reason: ChannelBlockError; until: Date }[];
  warnAdmin: 'send_spike'[];
  halveRateLimit: boolean;
};

/** Ngưỡng hỏng (0, âm, NaN, không nguyên) → mặc định (an toàn hơn là tắt kiểm tra). */
function failureThreshold(config?: AutoPauseConfig): number {
  const n = config?.maxConsecutiveSendFailures;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1
    ? n
    : AUTO_PAUSE_DEFAULTS.maxConsecutiveSendFailures;
}

function consecutiveFailures(outcomes: readonly SendOutcome[]): number {
  const newestFirst = outcomes
    .filter((o) => o.blockError === undefined)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  let streak = 0;
  for (const o of newestFirst) {
    if (o.ok) break;
    streak += 1;
  }
  return streak;
}

function channelSuspensions(outcomes: readonly SendOutcome[], now: Date) {
  const since = now.getTime() - CHANNEL_SUSPEND_MS;
  const byChannel = new Map<string, { reason: ChannelBlockError; at: Date }>();
  const blocked = outcomes
    .filter((o) => !o.ok && o.blockError !== undefined && o.at.getTime() >= since)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  for (const o of blocked) {
    if (o.blockError && !byChannel.has(o.channelId)) {
      byChannel.set(o.channelId, { reason: o.blockError, at: o.at });
    }
  }
  // Hạn khóa tính từ LẦN LỖI MỚI NHẤT (không phải từ `now`) để job chạy lặp không kéo dài hạn khóa.
  return [...byChannel].map(([channelId, { reason, at }]) => ({
    channelId,
    reason,
    until: new Date(at.getTime() + CHANNEL_SUSPEND_MS),
  }));
}

/** Đã đặt hạn mức mà số liệu chi phí hỏng (NaN/Infinity/âm) → coi là chạm trần (thiên về an toàn). */
function costCapReached({ spentUsd, capUsd }: AutoPauseInput['cost']): boolean {
  if (capUsd === null || !(capUsd > 0)) return false;
  if (!Number.isFinite(spentUsd) || spentUsd < 0) return true;
  return spentUsd >= capUsd;
}

export function evaluateAutoPause(input: AutoPauseInput, now: Date): AutoPauseDecision {
  const reasons: AutoPauseReason[] = [];
  if (costCapReached(input.cost)) reasons.push('cost_cap_reached');
  if (evaluateMarkedWrongSignal(input.records, now).pause) reasons.push('marked_wrong_rate');
  if (consecutiveFailures(input.sendOutcomes) >= failureThreshold(input.config)) {
    reasons.push('consecutive_send_failures');
  }
  const { lastHourSent, avgHourlySent7d } = input.spike;
  const spike =
    lastHourSent >= SPIKE_MIN_SENT && lastHourSent > SPIKE_FACTOR * Math.max(0, avgHourlySent7d);
  const [primary] = reasons;
  return {
    pauseWorkspace: primary ? { reason: primary, reasons } : null,
    suspendChannels: channelSuspensions(input.sendOutcomes, now),
    warnAdmin: spike ? ['send_spike'] : [],
    halveRateLimit: spike,
  };
}
