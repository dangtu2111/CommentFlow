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

/** Hạn cứng của phiên Admin: createdAt + 8 giờ (cố định, không trượt khi phiên được làm mới). */
export function adminSessionDeadline(createdAt: Date | string): Date {
  return new Date(new Date(createdAt).getTime() + ADMIN_SESSION_SECONDS * 1000);
}

/**
 * Better Auth đặt lại `expiresAt = now + expiresIn` mỗi lần làm mới phiên, nên trần 8 giờ của phiên
 * Admin phải kiểm theo `createdAt` ở lúc đọc phiên. Phiên app không có trần này (chỉ hạn 14 ngày).
 */
export function isSessionPastHardLimit(input: {
  isAdminSession: boolean;
  createdAt: Date | string;
  now: Date;
}): boolean {
  return (
    input.isAdminSession && input.now.getTime() > adminSessionDeadline(input.createdAt).getTime()
  );
}
