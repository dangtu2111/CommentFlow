import { randomBytes } from 'node:crypto';
import {
  AppError,
  type CreateInvoiceInput,
  generateTransferCode,
  type InvoiceStatus,
  parseConfirmPayment,
  parseCreateInvoice,
} from '@flow/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { invoices, payments } from './schema/core/invoices';

/** Số lần thử sinh lại mã chuyển khoản khi trùng (xác suất trùng ~10^-12; 3 lần là dư). */
const TRANSFER_CODE_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';

export type CreatedInvoice = {
  id: string;
  number: string;
  transferCode: string;
  amountVnd: number;
};

export type InvoiceRow = {
  id: string;
  product: string;
  number: string;
  amountVnd: number;
  items: unknown;
  status: InvoiceStatus;
  transferCode: string;
  dueAt: Date;
  /** Owner đã báo chuyển khoản (QR-PAYMENT, 0057); chỉ có ý nghĩa khi `status = 'pending'` ("chờ xác nhận"). */
  transferReportedAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
};

export type ReportTransferResult = 'ok' | 'already_reported' | 'paid' | 'void';

export type ConfirmPaymentInput = {
  workspaceId: string;
  invoiceId: string;
  amountVnd: number;
  /** Mã giao dịch ngân hàng — duy nhất toàn hệ thống (một giao dịch không tính hai lần). */
  bankRef: string;
  /** Nội dung sao kê gốc (có thể chứa tên người chuyển): không log, không gửi LLM. */
  rawStatement?: string | null;
  /** Người xác nhận (Admin); `null` = hệ thống. */
  confirmedBy?: string | null;
};

export type ConfirmPaymentResult = {
  result: 'ok' | 'amount_mismatch' | 'already_paid' | 'void';
  paymentId: string | null;
};

const pgCode = (error: unknown): string | undefined => {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code ?? (error as { code?: string })?.code;
};

/**
 * INVOICES (FR-091, migration 0052): tạo hóa đơn `pending` qua hàm DEFINER `core.create_invoice`. CHỈ gọi trong
 * `db.withJob(workspaceId, ...)` trên kết nối `cf_worker`. Tổng tiền do code tính từ `items` (DB tính lại và đối chiếu);
 * mã chuyển khoản sinh ngẫu nhiên mật mã học, trùng thì sinh lại (savepoint — lỗi trùng không làm hỏng giao dịch).
 */
export async function createInvoice(tx: Database, rawInput: unknown): Promise<CreatedInvoice> {
  const input: CreateInvoiceInput = parseCreateInvoice(rawInput);
  const items = input.items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unit_price_vnd: i.unitPriceVnd,
  }));
  for (let attempt = 1; attempt <= TRANSFER_CODE_ATTEMPTS; attempt += 1) {
    const transferCode = generateTransferCode(input.product, (n) => randomBytes(n));
    await tx.execute(sql`SAVEPOINT create_invoice_attempt`);
    try {
      const result = await tx.execute<{ invoice_id: string; invoice_number: string }>(sql`
        SELECT invoice_id, invoice_number
          FROM core.create_invoice(${input.workspaceId}::uuid, ${input.product}::text, ${input.amountVnd}::bigint,
                                   ${JSON.stringify(items)}::jsonb, ${transferCode}::text, ${input.dueAt.toISOString()}::timestamptz)`);
      const row = result.rows[0];
      if (!row) throw new AppError('INTERNAL', 'core.create_invoice không trả dòng nào');
      await tx.execute(sql`RELEASE SAVEPOINT create_invoice_attempt`);
      return {
        id: row.invoice_id,
        number: row.invoice_number,
        transferCode,
        amountVnd: input.amountVnd,
      };
    } catch (error) {
      if (pgCode(error) !== UNIQUE_VIOLATION || attempt === TRANSFER_CODE_ATTEMPTS) throw error;
      await tx.execute(sql`ROLLBACK TO SAVEPOINT create_invoice_attempt`);
    }
  }
  throw new AppError('INTERNAL', 'Không sinh được mã chuyển khoản duy nhất');
}

/**
 * Xác nhận thanh toán tay (FR-091/FR-102) qua `core.confirm_invoice_payment`. CHỈ trong `withJob`. Chỉ hóa đơn `pending`
 * + ĐÚNG số tiền mới `ok`; lệch tiền trả `amount_mismatch` và KHÔNG đổi gì (người xác nhận xử lý tay).
 */
export async function confirmInvoicePayment(
  tx: Database,
  rawInput: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const input = parseConfirmPayment(rawInput);
  const result = await tx.execute<{
    result: ConfirmPaymentResult['result'];
    payment_id: string | null;
  }>(sql`
    SELECT result, payment_id
      FROM core.confirm_invoice_payment(${input.workspaceId}::uuid, ${input.invoiceId}::uuid, ${input.amountVnd}::bigint,
                                        ${input.bankRef}::text, ${input.rawStatement}::text,
                                        ${input.confirmedBy}::uuid)`);
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.confirm_invoice_payment không trả dòng nào');
  return { result: row.result, paymentId: row.payment_id };
}

/** Hủy hóa đơn `pending` (idempotent): trả trạng thái hiện tại nếu không còn `pending`. CHỈ trong `withJob`. */
export async function voidInvoice(
  tx: Database,
  workspaceId: string,
  invoiceId: string,
): Promise<'ok' | 'paid' | 'void'> {
  const result = await tx.execute<{ void_invoice: 'ok' | 'paid' | 'void' }>(
    sql`SELECT core.void_invoice(${workspaceId}::uuid, ${invoiceId}::uuid) AS void_invoice`,
  );
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.void_invoice không trả dòng nào');
  return row.void_invoice;
}

/**
 * Owner báo "đã chuyển khoản" (QR-PAYMENT, FR-091, migration 0057) qua `core.report_invoice_transfer`. CHỈ gọi trong
 * `db.withActor(workspaceId, userId, ...)` trên kết nối `cf_app`: hàm tự kiểm Owner của đúng workspace (Staff/đường
 * hệ thống → 42501; hóa đơn workspace khác → P0002). KHÔNG đổi trạng thái `paid` — chỉ đánh dấu "chờ xác nhận".
 */
export async function reportInvoiceTransfer(
  tx: Database,
  workspaceId: string,
  invoiceId: string,
): Promise<ReportTransferResult> {
  const result = await tx.execute<{ report_invoice_transfer: ReportTransferResult }>(
    sql`SELECT core.report_invoice_transfer(${workspaceId}::uuid, ${invoiceId}::uuid) AS report_invoice_transfer`,
  );
  const row = result.rows[0];
  if (!row) throw new AppError('INTERNAL', 'core.report_invoice_transfer không trả dòng nào');
  return row.report_invoice_transfer;
}

/**
 * Lịch sử hóa đơn của workspace, mới nhất trước (FR-091, US-061). Chỉ đọc; RLS: Owner của workspace (đường web dùng
 * `withActor`; `withWorkspace` trần và Staff thấy 0 dòng) hoặc job hệ thống (`withJob`). Tối đa `limit` dòng (mặc định 100).
 */
export async function listInvoices(
  tx: Database,
  workspaceId: string,
  limit = 100,
): Promise<InvoiceRow[]> {
  const rows = await tx
    .select({
      id: invoices.id,
      product: invoices.product,
      number: invoices.number,
      amountVnd: invoices.amountVnd,
      items: invoices.items,
      status: invoices.status,
      transferCode: invoices.transferCode,
      dueAt: invoices.dueAt,
      transferReportedAt: invoices.transferReportedAt,
      paidAt: invoices.paidAt,
      voidedAt: invoices.voidedAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.workspaceId, workspaceId))
    .orderBy(desc(invoices.createdAt), desc(invoices.number))
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 500));
  return rows.map((r) => ({ ...r, status: r.status as InvoiceStatus }));
}

/** Một hóa đơn theo mã chuyển khoản (đối soát). Chỉ đọc; thấy được theo RLS của invoices. */
export async function findInvoiceByTransferCode(
  tx: Database,
  workspaceId: string,
  transferCode: string,
): Promise<{ id: string; amountVnd: number; status: InvoiceStatus } | null> {
  const [row] = await tx
    .select({ id: invoices.id, amountVnd: invoices.amountVnd, status: invoices.status })
    .from(invoices)
    .where(
      sql`${invoices.workspaceId} = ${workspaceId} and ${invoices.transferCode} = ${transferCode}`,
    )
    .limit(1);
  return row ? { ...row, status: row.status as InvoiceStatus } : null;
}

/** Thanh toán đã xác nhận của một hóa đơn (nếu có). Không đọc `raw_statement`/`confirmed_by` (không cấp cho `cf_app`). */
export async function getInvoicePayment(
  tx: Database,
  workspaceId: string,
  invoiceId: string,
): Promise<{ id: string; amountVnd: number; bankRef: string; confirmedAt: Date } | null> {
  const [row] = await tx
    .select({
      id: payments.id,
      amountVnd: payments.amountVnd,
      bankRef: payments.bankRef,
      confirmedAt: payments.confirmedAt,
    })
    .from(payments)
    .where(and(eq(payments.workspaceId, workspaceId), eq(payments.invoiceId, invoiceId)))
    .limit(1);
  return row ?? null;
}
