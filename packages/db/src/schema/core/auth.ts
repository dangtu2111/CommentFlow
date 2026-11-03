// Bảng xác thực của Better Auth (ADR 003). Khóa JS = tên trường mặc định của Better Auth
// (để drizzleAdapter khớp không cần ánh xạ); tên cột SQL theo quy ước snake_case của docs/10.
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, text, unique, uuid } from 'drizzle-orm/pg-core';
import { citext, core, createdAt, timestamptz, updatedAt } from './common';

export const users = core.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    name: text('name').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    // Tên thuộc tính theo plugin 2FA của Better Auth (`twoFactorEnabled`); cột SQL vẫn là totp_enabled (docs/10 §3.1).
    twoFactorEnabled: boolean('totp_enabled').notNull().default(false),
    locale: text('locale').notNull().default('vi'),
    isAdmin: boolean('is_admin').notNull().default(false),
    adminRole: text('admin_role'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_locale_check', sql`${t.locale} in ('vi', 'en')`),
    check(
      'users_admin_role_check',
      sql`${t.adminRole} is null or ${t.adminRole} in ('super', 'support', 'finance')`,
    ),
    check('users_admin_consistency_check', sql`${t.isAdmin} or ${t.adminRole} is null`),
  ],
);

/** Token phiên lưu THÔ (Better Auth không băm); cookie ký HMAC bù lại — xem docs/decisions/003. */
export const sessions = core.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    ipAddress: text('ip'),
    userAgent: text('user_agent'),
    isAdminSession: boolean('is_admin_session').notNull().default(false),
    createdAt: createdAt(),
    /** = last_seen_at trong spec; ghi tối đa 1 lần/giờ (session.updateAge). */
    updatedAt: updatedAt(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const accounts = core.table(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    /** Băm argon2id (hàm băm tùy chỉnh) cho provider `credential`. */
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    refreshTokenExpiresAt: timestamptz('refresh_token_expires_at'),
    scope: text('scope'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('accounts_provider_account_unique').on(t.providerId, t.accountId),
    index('accounts_user_id_idx').on(t.userId),
  ],
);

export const verifications = core.table(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/**
 * Plugin 2FA của Better Auth (ADR 003/004). `secret` và `backup_codes` được plugin MÃ HÓA (XChaCha20-Poly1305, khóa dẫn
 * xuất từ BETTER_AUTH_SECRET) trước khi lưu. Chỉ role cf_auth đọc/ghi được (RLS đòi app.ctx = 'auth'); cf_app không có quyền.
 */
export const twoFactors = core.table(
  'two_factors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    /** false = đã tạo secret nhưng chưa nhập mã đúng lần đầu (chưa bật). */
    verified: boolean('verified').notNull().default(true),
    /** Bộ đếm khóa tạm có sẵn của plugin (thất bại liên tiếp → locked_until). */
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamptz('locked_until'),
  },
  (t) => [index('two_factors_user_id_idx').on(t.userId)],
);
