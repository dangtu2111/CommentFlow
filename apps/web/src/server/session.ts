import { readSession } from '@flow/saas-core';
import { headers } from 'next/headers';
import { getAuthRuntime } from './auth';

export type CurrentUser = { id: string; name: string; email: string };

/**
 * Người dùng của phiên hiện tại, đọc PHÍA SERVER bằng `readSession` (cách duy nhất được hỗ trợ).
 * Các trạng thái như email_verified / 2FA / is_admin chỉ lấy từ đây, không bao giờ nhận từ client.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { auth, authHandle } = getAuthRuntime();
  const session = await readSession(auth, authHandle, await headers());
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}
