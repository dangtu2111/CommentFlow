import { isAllowedAuthRequest } from '../../../../lib/auth-route-guard';
import { getAuthRuntime } from '../../../../server/auth';

/**
 * Bề mặt công khai của Better Auth: CHỈ hai đường GET mà link trong thư dẫn tới (xem auth-route-guard.ts).
 * Đăng nhập/đăng ký/quên mật khẩu đi qua Server Action; mọi đường khác trả 404 cho tới khi có rate limit.
 */
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isAllowedAuthRequest(request.method, url.pathname, url.searchParams)) {
    return new Response(null, { status: 404 });
  }
  return getAuthRuntime().auth.handler(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
