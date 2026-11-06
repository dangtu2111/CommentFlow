import { sql } from 'drizzle-orm';
import { check, index, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/**
 * Vòng ghi nhận lỗi tích hợp (FR-104, docs/10 §3.2). Worker ghi (hệ thống) mỗi khi gọi nhà cung cấp ngoài lỗi;
 * Admin đọc tổng hợp xuyên workspace QUA hàm DEFINER (`cf.admin_integration_health`, chỉ Super Admin). `message`
 * đã che PII/token bằng `sanitizeIncidentMessage` (@flow/shared). Bất biến: không UPDATE/DELETE bằng cf_app.
 */
export const integrationIncidents = cf.table(
  'integration_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    kind: text('kind').notNull(),
    code: text('code').notNull(),
    message: text('message').notNull(),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index('integration_incidents_time_idx').on(t.occurredAt),
    index('integration_incidents_workspace_idx').on(t.workspaceId, t.provider, t.occurredAt),
    check(
      'integration_incidents_provider_check',
      sql`${t.provider} in ('facebook','instagram','tiktok','shopify','google_sheets','haravan','sapo','kiotviet','pancake','llm','smtp')`,
    ),
    check(
      'integration_incidents_kind_check',
      sql`${t.kind} in ('webhook','api','token','sync','queue')`,
    ),
    check('integration_incidents_code_check', sql`length(${t.code}) between 1 and 64`),
    check('integration_incidents_message_check', sql`length(${t.message}) <= 300`),
  ],
);
