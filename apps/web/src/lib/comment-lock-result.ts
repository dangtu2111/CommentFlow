/**
 * Trạng thái khóa mềm để hiển thị (FR-041). Thuần: nhận kết quả đã serialize (ngày dạng ISO) từ Server Action.
 * Khóa chỉ là cảnh báo — không quyết định quyền gửi.
 */
export type LockActionResult =
  | { status: 'acquired'; until: string }
  | { status: 'held'; holderId: string; holderName: string | null; until: string }
  | { status: 'not_found' };

export type LockViewState =
  | { kind: 'mine' }
  | { kind: 'held'; holderName: string | null; secondsLeft: number }
  | { kind: 'missing' };

/** Gia hạn mỗi 60 giây (TTL 120 giây, docs/11 §5) khi panel còn mở. */
export const LOCK_RENEW_MS = 60_000;

export function remainingSeconds(until: Date, now: Date): number {
  const ms = until.getTime() - now.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

export function toLockViewState(result: LockActionResult, now: Date): LockViewState {
  switch (result.status) {
    case 'acquired':
      return { kind: 'mine' };
    case 'held':
      return {
        kind: 'held',
        holderName: result.holderName,
        secondsLeft: remainingSeconds(new Date(result.until), now),
      };
    default:
      return { kind: 'missing' };
  }
}
