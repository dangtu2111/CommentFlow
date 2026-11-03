import { and, eq, type FlowDb, gt } from '@flow/db';
import { sessions } from '@flow/db/schema/core';
import type { Auth } from './auth';
import { adminSessionDeadline, isSessionPastHardLimit } from './session-policy';

/**
 * Đọc phiên từ cookie — cách DUY NHẤT được hỗ trợ để lấy phiên đăng nhập ở tầng ứng dụng.
 * Ngoài việc kiểm cookie/hạn của Better Auth, áp thêm hạn cứng 8 giờ (từ lúc tạo) cho phiên Admin:
 * Better Auth đặt lại hạn = now + 14 ngày mỗi lần làm mới phiên, nên hạn cứng phải kiểm ở đây.
 */
export async function readSession(
  auth: Auth,
  db: FlowDb,
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
  const isAdminSession = session.isAdminSession === true;

  if (isSessionPastHardLimit({ isAdminSession, createdAt: session.createdAt, now })) {
    await db.system.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  if (isAdminSession) {
    // Kéo hạn lưu trong DB về đúng hạn cứng (nếu lần làm mới vừa đẩy nó ra xa).
    const deadline = adminSessionDeadline(session.createdAt);
    await db.system
      .update(sessions)
      .set({ expiresAt: deadline })
      .where(and(eq(sessions.id, session.id), gt(sessions.expiresAt, deadline)));
  }
  return current;
}
