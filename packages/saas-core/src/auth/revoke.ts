import { and, eq, ne } from '@flow/db/runtime';
import { sessions } from '@flow/db/schema/core';
import { AppError } from '@flow/shared';
import type { Auth } from './auth';
import { type AuthHandle, unwrapAuthDb } from './auth-db';

/** Xóa MỌI phiên của một người dùng (đổi mật khẩu, đổi quyền, nghi ngờ bị chiếm tài khoản). */
export async function revokeAllSessionsOfUser(authDb: AuthHandle, userId: string): Promise<number> {
  const removed = await unwrapAuthDb(authDb).transaction((tx) =>
    tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id }),
  );
  return removed.length;
}

/** Xóa mọi phiên của người dùng TRỪ phiên đang dùng ("Đăng xuất tất cả thiết bị khác"). Không đụng người dùng khác. */
export async function revokeOtherSessionsOfUser(
  authDb: AuthHandle,
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const removed = await unwrapAuthDb(authDb).transaction((tx) =>
    tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)))
      .returning({ id: sessions.id }),
  );
  return removed.length;
}

/**
 * Đổi mật khẩu rồi xóa mọi phiên (kể cả phiên hiện tại) — buộc đăng nhập lại (docs/13 §2).
 * Cần cookie của phiên đang đăng nhập.
 */
export async function changePasswordAndRevokeAll(
  auth: Auth,
  authDb: AuthHandle,
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
  await revokeAllSessionsOfUser(authDb, current.user.id);
}
