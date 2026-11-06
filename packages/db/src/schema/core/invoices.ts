import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { core, createdAt, timestamptz, updatedAt } from './common';
import { workspaces } from './tenancy';

/** Bộ đếm số hóa đơn (`INV-YYYYMM-NNNNNN`); chỉ hàm DEFINER `core.create_invoice` dùng. */
export const invoiceNumberSeq = core.sequence('invoice_number_seq');

/**
 * Hóa đơn (FR-091, docs/10 §3.6, migration 0052, Q-INV1). `cf_app` chỉ ĐỌC (Owner của workspace); ghi duy nhất qua hàm
 * DEFINER `core.create_invoice` / `core.confirm_invoice_payment` / `core.void_invoice` (chỉ `withJob` trên `cf_worker`).
 * `transfer_code` là nội dung chuyển khoản bắt buộc để đối soát. Chưa có `subscription_id` (PLANS-SCHEMA chưa có).
 */
export const invoices = core.table(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    product: text('product').notNull(),
    number: text('number').notNull(),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    items: jsonb('items').notNull(),
    status: text('status').notNull().default('pending'),
    transferCode: text('transfer_code').notNull(),
    dueAt: timestamptz('due_at').notNull(),
    /** Owner báo "đã chuyển khoản" (QR-PAYMENT, 0057): hóa đơn `pending` hiển thị "chờ xác nhận"; KHÔNG phải bằng chứng đã nhận tiền. */
    transferReportedAt: timestamptz('transfer_reported_at'),
    paidAt: timestamptz('paid_at'),
    voidedAt: timestamptz('voided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('invoices_number_unique').on(t.number),
    unique('invoices_transfer_code_unique').on(t.transferCode),
    unique('invoices_workspace_id_id_unique').on(t.workspaceId, t.id),
    index('invoices_workspace_idx').on(t.workspaceId, t.createdAt),
    check('invoices_product_check', sql`${t.product} in ('commentflow', 'excelflow')`),
    check('invoices_status_check', sql`${t.status} in ('pending', 'paid', 'void')`),
    check('invoices_amount_check', sql`${t.amountVnd} between 1 and 1000000000`),
    check('invoices_number_check', sql`${t.number} ~ '^INV-[0-9]{6}-[0-9]{6,}$'`),
    check(
      'invoices_transfer_code_check',
      sql`${t.transferCode} ~ '^(CF|XF)[A-HJ-NP-Z2-9]{8}$' and left(${t.transferCode}, 2) = case ${t.product} when 'commentflow' then 'CF' else 'XF' end`,
    ),
    check('invoices_items_check', sql`jsonb_typeof(${t.items}) = 'array'`),
    check(
      'invoices_state_check',
      sql`(${t.status} = 'paid') = (${t.paidAt} is not null) and (${t.status} = 'void') = (${t.voidedAt} is not null)`,
    ),
  ],
);

/**
 * Xác nhận thanh toán tay (FR-091/FR-102): một dòng cho mỗi hóa đơn, `bank_ref` duy nhất toàn hệ thống (một giao dịch
 * ngân hàng không được tính hai lần). `raw_statement` là nội dung sao kê gốc — có thể chứa tên người chuyển: KHÔNG log,
 * KHÔNG gửi LLM/Langfuse (nguyên tắc #6).
 */
export const payments = core.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    bankRef: text('bank_ref').notNull(),
    rawStatement: text('raw_statement'),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamptz('confirmed_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'payments_invoice_fk',
      columns: [t.workspaceId, t.invoiceId],
      foreignColumns: [invoices.workspaceId, invoices.id],
    }).onDelete('cascade'),
    unique('payments_invoice_unique').on(t.invoiceId),
    unique('payments_bank_ref_unique').on(t.bankRef),
    check('payments_amount_check', sql`${t.amountVnd} between 1 and 1000000000`),
    check('payments_bank_ref_check', sql`char_length(${t.bankRef}) between 1 and 100`),
    check(
      'payments_raw_statement_check',
      sql`${t.rawStatement} is null or char_length(${t.rawStatement}) <= 2000`,
    ),
  ],
);
