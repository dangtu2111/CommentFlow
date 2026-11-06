import type { AutoSentRecord } from './auto-sent-record';

/** docs/09 §11.2: > 10% trong 1 giờ, tối thiểu 10 câu → tự tạm dừng tự gửi. */
export const MARKED_WRONG_WINDOW_MS = 60 * 60 * 1000;
export const MARKED_WRONG_MIN_SENT = 10;
export const MARKED_WRONG_RATE_THRESHOLD = 0.1;

export type MarkedWrongSignal = { pause: boolean; sent: number; wrong: number; rate: number };

/**
 * Tín hiệu lạm dụng từ tỷ lệ Đánh dấu sai (FR-075, FR-115). Chỉ tính câu GỬI trong 1 giờ gần nhất (đúng 60 phút
 * còn tính). Hàm thuần; việc tạm dừng thật do job `abuse` (ABUSE-JOB) làm khi nối.
 */
export function evaluateMarkedWrongSignal(
  records: readonly AutoSentRecord[],
  now: Date,
): MarkedWrongSignal {
  const since = now.getTime() - MARKED_WRONG_WINDOW_MS;
  const recent = records.filter((r) => r.sentAt.getTime() >= since);
  const wrong = recent.filter((r) => r.status === 'marked_wrong').length;
  const sent = recent.length;
  const rate = sent === 0 ? 0 : wrong / sent;
  // So bằng số nguyên (wrong*10 > sent) để đúng 10% không bị sai số dấu phẩy động.
  const pause = sent >= MARKED_WRONG_MIN_SENT && wrong * 10 > sent;
  return { pause, sent, wrong, rate };
}
