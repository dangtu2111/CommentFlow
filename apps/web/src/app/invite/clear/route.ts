import { redirect } from 'next/navigation';
import { forgetInvite } from '../../../server/invite-cookie';

/** Bỏ lời mời đang nhớ (lời mời không dùng được hoặc người dùng chọn "để sau") rồi vào /app. */
export async function GET(): Promise<never> {
  await forgetInvite();
  redirect('/app');
}
