import { eq } from '@flow/db';
import type { AuthDb } from '@flow/db/auth-db';
import { sessions } from '@flow/db/schema/core';
import type { Auth } from './auth';
import { isSessionPastHardLimit } from './session-policy';

/**
 * Đọc phiên từ cookie. Hạn 8 giờ của phiên Admin đã được ép ở DATABASE (trigger, migration 0007) nên
 * Better Auth tự coi phiên Admin quá hạn là hết hạn ở mọi đường. Hàm này thêm LỚP THỨ HAI: nếu vì lý do
 * nào đó phiên Admin vẫn còn quá 8 giờ kể từ lúc tạo thì xóa và trả null.
 */
export async function readSession(
  auth: Auth,
  authDb: AuthDb,
  headers: Headers,
  now: Date = new Date(),
) {
  const current = await auth.api.getSession({ headers });
  if (!current) return null;

  const session = current.session as {
    id: string;
    createdAt: Date | string;
    isAdminSession?: boolean;
  };

  if (
    isSessionPastHardLimit({
      isAdminSession: session.isAdminSession === true,
      createdAt: session.createdAt,
      now,
    })
  ) {
    await authDb.transaction((tx) => tx.delete(sessions).where(eq(sessions.id, session.id)));
    return null;
  }
  return current;
}
