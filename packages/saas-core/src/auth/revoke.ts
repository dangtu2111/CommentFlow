import { eq, type FlowDb } from '@flow/db';
import { sessions } from '@flow/db/schema/core';
import { AppError } from '@flow/shared';
import type { Auth } from './auth';

/** Xóa MỌI phiên của một người dùng (đổi mật khẩu, đổi quyền, nghi ngờ bị chiếm tài khoản). */
export async function revokeAllSessionsOfUser(db: FlowDb, userId: string): Promise<number> {
  const removed = await db.withAuthContext((tx) =>
    tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id }),
  );
  return removed.length;
}

/**
 * Đổi mật khẩu rồi xóa mọi phiên (kể cả phiên hiện tại) — buộc đăng nhập lại (docs/13 §2).
 * Cần cookie của phiên đang đăng nhập.
 */
export async function changePasswordAndRevokeAll(
  auth: Auth,
  db: FlowDb,
  input: { headers: Headers; currentPassword: string; newPassword: string },
): Promise<void> {
  const current = await auth.api.getSession({ headers: input.headers });
  if (!current) throw new AppError('UNAUTHENTICATED', 'Bạn cần đăng nhập để đổi mật khẩu.');
  await auth.api.changePassword({
    headers: input.headers,
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: true,
    },
  });
  await revokeAllSessionsOfUser(db, current.user.id);
}
