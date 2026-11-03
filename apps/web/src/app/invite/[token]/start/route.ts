import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { rememberInvite } from '../../../../server/invite-cookie';

/**
 * Bắt đầu nhận lời mời khi chưa đăng nhập: nhớ token (cookie ký, httpOnly) rồi chuyển tới đăng nhập hoặc đăng ký.
 * Sau khi đăng nhập xong, trang /app đưa người dùng quay lại /invite/<token> để bấm chấp nhận. Chỉ hai đích cố định.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<never> {
  const { token } = await context.params;
  await rememberInvite(token);
  redirect(request.nextUrl.searchParams.get('mode') === 'register' ? '/register' : '/login');
}
