/** Hạn phiên app (docs/13 §2): 14 ngày. */
export const APP_SESSION_SECONDS = 14 * 24 * 3600;
/** Hạn phiên Admin (`is_admin_session`): 8 giờ. */
export const ADMIN_SESSION_SECONDS = 8 * 3600;
/** `updated_at` (= last_seen_at) chỉ được ghi tối đa 1 lần/giờ. */
export const SESSION_UPDATE_AGE_SECONDS = 3600;

/**
 * Hạn cuối cùng của phiên: lấy MIN giữa hạn đã tính (Better Auth) và trần theo loại phiên.
 * Không bao giờ kéo dài hạn (ví dụ phiên "không nhớ tôi" 1 ngày vẫn là 1 ngày).
 */
export function capSessionExpiry(input: {
  expiresAt: Date;
  isAdminSession: boolean;
  now: Date;
}): Date {
  const ceilingSeconds = input.isAdminSession ? ADMIN_SESSION_SECONDS : APP_SESSION_SECONDS;
  const ceiling = new Date(input.now.getTime() + ceilingSeconds * 1000);
  return input.expiresAt.getTime() <= ceiling.getTime() ? input.expiresAt : ceiling;
}
