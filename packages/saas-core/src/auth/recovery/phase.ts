import type { RecoveryPhase, RecoveryRequest } from './types';

/** Hằng số mặc định (QRCV1): đổi số ở đây. */
export const VERIFY_TTL_MS = 60 * 60 * 1000; // link xác minh email: 1 giờ
export const RELEASE_WAIT_MS = 72 * 60 * 60 * 1000; // chờ sau khi xác minh email: 72 giờ
export const COMPLETE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // hoàn tất trong 7 ngày sau mốc sẵn sàng

/** `releaseAt` của tài khoản quản trị: không bao giờ tự đến — chỉ admin khác duyệt mới hoàn tất được. */
export const NEVER_MS = 8.64e15;

/** Mốc sớm nhất có thể hoàn tất: hết hạn chờ, hoặc lúc được quản trị viên duyệt (nếu sớm hơn). */
function readyAt(request: RecoveryRequest): number | null {
  const times = [request.releaseAt, request.approvedAt].filter(
    (t): t is number => typeof t === 'number',
  );
  return times.length === 0 ? null : Math.min(...times);
}

/** Pha của yêu cầu tại thời điểm `now` (hàm thuần: cùng đầu vào → cùng kết quả). */
export function recoveryPhase(request: RecoveryRequest, now: number): RecoveryPhase {
  switch (request.status) {
    case 'completed':
    case 'cancelled':
    case 'superseded':
      return request.status;
    case 'awaiting_email':
      return now <= request.verifyExpiresAt ? 'awaiting_email' : 'expired';
    case 'waiting': {
      const ready = readyAt(request);
      if (ready === null) return 'expired'; // dữ liệu hỏng: coi như không dùng được
      if (now < ready) return 'waiting';
      return now <= ready + COMPLETE_WINDOW_MS ? 'ready' : 'expired';
    }
  }
}
