import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/** Khớp `POLICY_FACT_KINDS/STATUSES/ORIGINS` ở `@flow/shared`. */
export const POLICY_FACT_KIND_VALUES = [
  'ship_region',
  'cod',
  'returns',
  'warranty',
  'payment',
] as const;
export const POLICY_FACT_STATUS_VALUES = ['draft', 'approved'] as const;
export const POLICY_FACT_ORIGIN_VALUES = ['manual', 'shopify_suggested', 'text_suggested'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Chính sách CÓ CẤU TRÚC (DRAFT-FACT-SLOTS, ADR 017): nguồn chuẩn của sự kiện chính sách (ship theo khu vực, COD, đổi trả, bảo hành, thanh toán) cho fact plan. `data` do ứng dụng kiểm bằng Zod
 * theo `kind`. `slot` = định danh trong workspace (dòng khu vực ship: nhãn chuẩn hóa; loại còn lại: chính `kind`) — mỗi (kind, slot) tối đa MỘT bản nháp và MỘT bản đã duyệt.
 * Chỉ Owner duyệt (trigger `policy_facts_guard`); hệ thống (worker) chỉ ghi ĐỀ XUẤT nháp có `evidence` (nguyên văn trích từ nguồn). Giá trị `draft` KHÔNG BAO GIỜ vào fact plan.
 */
export const policyFacts = cf.table(
  'policy_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    slot: text('slot').notNull(),
    data: jsonb('data').notNull(),
    status: text('status').notNull().default('draft'),
    origin: text('origin').notNull().default('manual'),
    /** Nguyên văn trích từ nguồn (đề xuất của AI/Shopify): bắt buộc khi `origin` ≠ `manual`. */
    evidence: text('evidence'),
    sourceRef: text('source_ref'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rev: integer('rev').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('policy_facts_workspace_kind_slot_status_unique').on(
      t.workspaceId,
      t.kind,
      t.slot,
      t.status,
    ),
    index('policy_facts_workspace_status_idx').on(t.workspaceId, t.status, t.kind),
    check('policy_facts_kind_check', sql`${t.kind} IN (${inList(POLICY_FACT_KIND_VALUES)})`),
    check('policy_facts_status_check', sql`${t.status} IN (${inList(POLICY_FACT_STATUS_VALUES)})`),
    check('policy_facts_origin_check', sql`${t.origin} IN (${inList(POLICY_FACT_ORIGIN_VALUES)})`),
    check('policy_facts_slot_check', sql`char_length(${t.slot}) between 1 and 100`),
    check('policy_facts_data_check', sql`jsonb_typeof(${t.data}) = 'object'`),
    check(
      'policy_facts_evidence_check',
      sql`(${t.evidence} IS NULL OR char_length(${t.evidence}) between 1 and 2000) AND (${t.origin} = 'manual' OR ${t.evidence} IS NOT NULL)`,
    ),
  ],
);
