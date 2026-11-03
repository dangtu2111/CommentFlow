/** Đích quay lại DUY NHẤT được phép (khớp đúng giá trị mà saas-core đặt khi tạo link trong thư). */
export const VERIFY_EMAIL_CALLBACK = '/verify-email?status=ok';
export const RESET_PASSWORD_CALLBACK = '/reset-password';

/**
 * Bề mặt công khai của Better Auth trên web: CHỈ hai đường GET mà link trong thư dẫn tới, và `callbackURL` phải
 * đúng bằng đích cố định (chặn open redirect không phụ thuộc `trustedOrigins` của thư viện).
 * Đăng nhập, đăng ký, quên mật khẩu... đi qua Server Action (có kiểm đầu vào + kết quả trung tính), nên mọi đường
 * `/api/auth/*` khác — kể cả POST — bị chặn cho tới khi có rate limit (AUTH-RATELIMIT).
 */
export function isAllowedAuthRequest(
  method: string,
  pathname: string,
  query: URLSearchParams = new URLSearchParams(),
): boolean {
  if (method !== 'GET') return false;
  const callback = query.get('callbackURL');
  if (pathname === '/api/auth/verify-email') return callback === VERIFY_EMAIL_CALLBACK;
  if (/^\/api\/auth\/reset-password\/[A-Za-z0-9._~-]{1,512}$/.test(pathname)) {
    return callback === RESET_PASSWORD_CALLBACK;
  }
  return false;
}
