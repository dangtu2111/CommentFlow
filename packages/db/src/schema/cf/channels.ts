import { sql } from 'drizzle-orm';
import { boolean, check, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/**
 * Kênh nền tảng đã kết nối (docs/10 §3.2): Fanpage, Instagram, TikTok.
 * `access_token_enc` (token Page mã hóa) KHÔNG có quyền cột nào cho cf_app: tạo kênh có token và đọc token do hàm DB
 * hẹp ở `TOKEN-ENC` làm. Cột khóa gửi do Admin (`send_suspended_*`, `rate_limit_override`) cf_app không sửa được.
 */
export const channels = cf.table(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    accessTokenEnc: text('access_token_enc'),
    tokenExpiresAt: timestamptz('token_expires_at'),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    status: text('status').notNull().default('connected'),
    webhookSubscribed: boolean('webhook_subscribed').notNull().default(false),
    replyLanguage: text('reply_language').notNull().default('auto'),
    capabilities: jsonb('capabilities').notNull().default(sql`'{}'::jsonb`),
    lastPolledAt: timestamptz('last_polled_at'),
    sendSuspendedUntil: timestamptz('send_suspended_until'),
    sendSuspendedReason: text('send_suspended_reason'),
    rateLimitOverride: jsonb('rate_limit_override'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('channels_platform_external_workspace_unique').on(
      t.platform,
      t.externalId,
      t.workspaceId,
    ),
    // Đích của khóa ngoại ghép (workspace_id, channel_id) từ posts/comments: chặn gắn dữ liệu chéo workspace.
    unique('channels_workspace_id_id_unique').on(t.workspaceId, t.id),
    check('channels_platform_check', sql`${t.platform} in ('facebook', 'instagram', 'tiktok')`),
    check(
      'channels_status_check',
      sql`${t.status} in ('connected', 'expired', 'revoked', 'error')`,
    ),
    check('channels_reply_language_check', sql`${t.replyLanguage} in ('auto', 'vi', 'en')`),
  ],
);
