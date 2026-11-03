import { redirect } from 'next/navigation';
import { forgetInvite, pendingInviteToken } from '../../../server/invite-cookie';

/**
 * Dùng lời mời đang nhớ MỘT lần: đọc cookie, xóa ngay, rồi chuyển tới trang lời mời (người dùng vẫn phải bấm
 * "Chấp nhận"). Không có cookie hợp lệ → /app. Nhờ xóa ngay nên lời mời sai/không dùng được không kéo người dùng
 * về trang lời mời mãi.
 */
export async function GET(): Promise<never> {
  const token = await pendingInviteToken();
  await forgetInvite();
  redirect(token ? `/invite/${token}` : '/app');
}
