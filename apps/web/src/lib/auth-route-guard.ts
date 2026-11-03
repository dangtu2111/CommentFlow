/**
 * Bề mặt công khai của Better Auth trên web: CHỈ hai đường GET mà link trong thư dẫn tới.
 * Đăng nhập, đăng ký, quên mật khẩu... đi qua Server Action (có kiểm đầu vào + kết quả trung tính), nên mọi đường
 * `/api/auth/*` khác — kể cả POST — bị chặn cho tới khi có rate limit (AUTH-RATELIMIT).
 */
export function isAllowedAuthRequest(method: string, pathname: string): boolean {
  if (method !== 'GET') return false;
  if (pathname === '/api/auth/verify-email') return true;
  return /^\/api\/auth\/reset-password\/[A-Za-z0-9._~-]{1,512}$/.test(pathname);
}
