import { and, eq, sql } from '@flow/db/runtime';
import { phoneVerifications, users } from '@flow/db/schema/core';
import type { AuthHandle } from './auth-db';
import { unwrapAuthDb } from './auth-db';
import type { PhoneChallenge, PhoneChallengeStore } from './phone-verify';

/** Phần hồ sơ mà `cf_app` KHÔNG đọc được (migration 0062) nên đọc bằng `cf_auth` theo userId lấy từ phiên. */
export type AuthProfile = {
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  /** E.164 thô — chỉ dùng phía server để che trước khi đưa xuống giao diện. */
  phone: string | null;
  phoneVerifiedAt: Date | null;
};

const asTheme = (value: string): AuthProfile['theme'] =>
  value === 'light' || value === 'dark' ? value : 'system';

/**
 * Kho hồ sơ/OTP chạy bằng role `cf_auth` (ngữ cảnh 'auth'): đọc timezone/theme/SĐT của chính người dùng và lưu thử thách
 * OTP. `userId` luôn do nơi gọi lấy từ phiên đã xác thực, không từ client.
 */
export function createAuthProfileStore(authDb: AuthHandle) {
  const db = () => unwrapAuthDb(authDb);

  async function readProfile(userId: string): Promise<AuthProfile | null> {
    const rows = await db().transaction((tx) =>
      tx
        .select({
          timezone: users.timezone,
          theme: users.theme,
          phone: users.phone,
          phoneVerifiedAt: users.phoneVerifiedAt,
        })
        .from(users)
        .where(eq(users.id, userId)),
    );
    const row = rows[0];
    return row ? { ...row, theme: asTheme(row.theme) } : null;
  }

  const challenges: PhoneChallengeStore = {
    async upsert(challenge: PhoneChallenge) {
      await db().transaction((tx) =>
        tx
          .insert(phoneVerifications)
          .values(challenge)
          .onConflictDoUpdate({
            target: phoneVerifications.userId,
            set: {
              phone: challenge.phone,
              codeHash: challenge.codeHash,
              expiresAt: challenge.expiresAt,
              attempts: 0,
              sentAt: challenge.sentAt,
            },
          }),
      );
    },
    async find(userId) {
      const rows = await db().transaction((tx) =>
        tx.select().from(phoneVerifications).where(eq(phoneVerifications.userId, userId)),
      );
      return rows[0] ?? null;
    },
    async addAttempt(userId) {
      const rows = await db().transaction((tx) =>
        tx
          .update(phoneVerifications)
          .set({ attempts: sql`${phoneVerifications.attempts} + 1` })
          .where(eq(phoneVerifications.userId, userId))
          .returning({ attempts: phoneVerifications.attempts }),
      );
      return rows[0]?.attempts ?? 0;
    },
    async remove(userId) {
      await db().transaction((tx) =>
        tx.delete(phoneVerifications).where(eq(phoneVerifications.userId, userId)),
      );
    },
    async markVerified(userId, phone, at) {
      await db().transaction(async (tx) => {
        await tx
          .update(users)
          .set({ phone, phoneVerifiedAt: at })
          .where(eq(users.id, userId));
        await tx
          .delete(phoneVerifications)
          .where(and(eq(phoneVerifications.userId, userId), eq(phoneVerifications.phone, phone)));
      });
    },
  };

  return { readProfile, challenges };
}

export type AuthProfileStore = ReturnType<typeof createAuthProfileStore>;
