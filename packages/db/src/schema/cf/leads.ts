import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/**
 * Khách tiềm năng (FR-082, docs/10 §3.5 `leads`, Q-LDS1). KHÔNG lưu SĐT/email thô: `*_enc` = AES-256-GCM (tầng ứng
 * dụng, `lead-vault.ts`), `*_hash` = HMAC-SHA256 theo workspace (chống trùng), `phone_last4` để hiển thị.
 * INSERT chỉ hệ thống (ContactSink qua `withJob`); thành viên đổi giai đoạn/ghi chú/người được giao.
 */
export const leads = cf.table(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    name: text('name'),
    phoneEnc: bytea('phone_enc'),
    phoneHash: bytea('phone_hash'),
    phoneLast4: text('phone_last4'),
    emailEnc: bytea('email_enc'),
    emailHash: bytea('email_hash'),
    /** Phiên bản khóa `LEADS_ENC_KEYS` đã mã hóa cả hai cột `*_enc` của dòng. */
    keyVersion: integer('key_version').notNull(),
    note: text('note'),
    stage: text('stage').notNull().default('new'),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'leads_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }),
    uniqueIndex('leads_phone_hash_unique')
      .on(t.workspaceId, t.phoneHash)
      .where(sql`${t.phoneHash} IS NOT NULL`),
    uniqueIndex('leads_email_hash_unique')
      .on(t.workspaceId, t.emailHash)
      .where(sql`${t.emailHash} IS NOT NULL`),
    index('leads_workspace_stage_idx').on(t.workspaceId, t.stage, t.createdAt),
    check('leads_source_type_check', sql`${t.sourceType} IN ('comment', 'message')`),
    check('leads_stage_check', sql`${t.stage} IN ('new', 'contacted', 'won', 'lost')`),
    check('leads_name_len_check', sql`char_length(${t.name}) <= 120`),
    check('leads_note_len_check', sql`char_length(${t.note}) <= 500`),
    check('leads_last4_check', sql`${t.phoneLast4} ~ '^[0-9]{4}$'`),
    // Phải có ít nhất một liên hệ; mỗi liên hệ đủ bộ (bản mã + băm [+ 4 số cuối cho SĐT]).
    check(
      'leads_contact_shape_check',
      sql`(${t.phoneEnc} IS NOT NULL AND ${t.phoneHash} IS NOT NULL AND ${t.phoneLast4} IS NOT NULL
        OR ${t.phoneEnc} IS NULL AND ${t.phoneHash} IS NULL AND ${t.phoneLast4} IS NULL)
        AND (${t.emailEnc} IS NOT NULL AND ${t.emailHash} IS NOT NULL
        OR ${t.emailEnc} IS NULL AND ${t.emailHash} IS NULL)
        AND (${t.phoneEnc} IS NOT NULL OR ${t.emailEnc} IS NOT NULL)`,
    ),
    check(
      'leads_hash_len_check',
      sql`octet_length(${t.phoneHash}) = 32 AND octet_length(${t.emailHash}) = 32`,
    ),
  ],
);
