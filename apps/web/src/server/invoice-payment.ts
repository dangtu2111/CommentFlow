import { type FlowDb, listInvoices, reportInvoiceTransfer } from '@flow/db/runtime';
import { type PaymentQr, renderPaymentQr } from '@flow/saas-core';
import { type PaymentReceiver, parsePaymentReceiver } from '@flow/shared';
import { z } from 'zod';

/**
 * Thanh toán chuyển khoản bằng QR (QR-PAYMENT, FR-091, US-061; Q-QRP1). Tài khoản nhận tiền là tài nguyên ngoài: đọc từ
 * biến môi trường sau cờ `QR_PAYMENT_ENABLED` (MẶC ĐỊNH TẮT, chỉ đúng chữ `true` mới bật). Cờ tắt → `disabled`; bật mà
 * thiếu/sai cấu hình → `unavailable` (đóng: không dựng QR, KHÔNG ném lỗi, KHÔNG in giá trị). Test truyền thẳng một
 * `PaymentReceiverProvider` fixture thay cho đọc môi trường.
 *
 * Số tiền và nội dung chuyển khoản luôn lấy từ hóa đơn trong DB (nguyên tắc #4); AI không tham gia. Mọi truy vấn qua
 * `withActor(workspaceId, userId)` với id từ phiên server (nguyên tắc #2) — RLS chỉ cho Owner của workspace đọc hóa đơn.
 */
export type PaymentReceiverProvider =
  | { state: 'disabled' }
  | { state: 'unavailable' }
  | { state: 'ready'; receiver: PaymentReceiver };

const envSchema = z.object({
  PAYMENT_BANK_BIN: z.string(),
  PAYMENT_ACCOUNT_NUMBER: z.string(),
  PAYMENT_ACCOUNT_NAME: z.string(),
});

export function envPaymentReceiverProvider(
  source: Record<string, string | undefined> = process.env,
): PaymentReceiverProvider {
  if (source.QR_PAYMENT_ENABLED?.trim() !== 'true') return { state: 'disabled' };
  const env = envSchema.safeParse({
    PAYMENT_BANK_BIN: source.PAYMENT_BANK_BIN ?? '',
    PAYMENT_ACCOUNT_NUMBER: source.PAYMENT_ACCOUNT_NUMBER ?? '',
    PAYMENT_ACCOUNT_NAME: source.PAYMENT_ACCOUNT_NAME ?? '',
  });
  if (!env.success) return { state: 'unavailable' };
  try {
    return {
      state: 'ready',
      receiver: parsePaymentReceiver({
        bankBin: env.data.PAYMENT_BANK_BIN,
        accountNumber: env.data.PAYMENT_ACCOUNT_NUMBER,
        accountName: env.data.PAYMENT_ACCOUNT_NAME,
      }),
    };
  } catch {
    return { state: 'unavailable' };
  }
}

export type PaymentDeps = {
  db: FlowDb;
  provider: PaymentReceiverProvider;
  render: (input: {
    receiver: PaymentReceiver;
    amountVnd: number;
    transferCode: string;
  }) => Promise<PaymentQr>;
};

export type PaymentActor = { workspaceId: string; userId: string };

export type PaymentCard =
  | { state: 'disabled' | 'unavailable' | 'none' }
  | {
      state: 'ready';
      invoice: {
        id: string;
        number: string;
        amountVnd: number;
        transferCode: string;
        /** Owner đã báo chuyển khoản → hóa đơn "chờ xác nhận". */
        reported: boolean;
      };
      receiver: PaymentReceiver;
      qrDataUrl: string;
    };

/** Số hóa đơn đọc để tìm hóa đơn đang chờ (mới nhất trước); đủ cho lịch sử gần đây. */
const INVOICE_SCAN_LIMIT = 20;

export function defaultPaymentDeps(db: FlowDb): PaymentDeps {
  return { db, provider: envPaymentReceiverProvider(), render: renderPaymentQr };
}

/**
 * Thẻ thanh toán của hóa đơn `pending` mới nhất. Staff/không phải Owner: RLS trả 0 hóa đơn → `none` (không lộ QR).
 * Lỗi dựng QR → `unavailable` để không làm hỏng trang Cài đặt.
 */
export async function loadPaymentCard(
  deps: PaymentDeps,
  actor: PaymentActor,
): Promise<PaymentCard> {
  if (deps.provider.state !== 'ready') return { state: deps.provider.state };
  const { receiver } = deps.provider;
  const rows = await deps.db.withActor(actor.workspaceId, actor.userId, (tx) =>
    listInvoices(tx, actor.workspaceId, INVOICE_SCAN_LIMIT),
  );
  const pending = rows.find((row) => row.status === 'pending');
  if (!pending) return { state: 'none' };
  try {
    const qr = await deps.render({
      receiver,
      amountVnd: pending.amountVnd,
      transferCode: pending.transferCode,
    });
    return {
      state: 'ready',
      invoice: {
        id: pending.id,
        number: pending.number,
        amountVnd: pending.amountVnd,
        transferCode: pending.transferCode,
        reported: pending.transferReportedAt !== null,
      },
      receiver,
      qrDataUrl: qr.dataUrl,
    };
  } catch (error) {
    console.error('payment_qr_render_failed', {
      workspaceId: actor.workspaceId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return { state: 'unavailable' };
  }
}

export type ReportTransferOutcome =
  | 'ok'
  | 'already_reported'
  | 'paid'
  | 'void'
  | 'disabled'
  | 'not_found'
  | 'forbidden';

const pgCode = (error: unknown): string | undefined =>
  (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;

/**
 * Owner báo "đã chuyển khoản". Cờ tắt/thiếu cấu hình → `disabled` (không chạm DB). `invoiceId` không phải uuid hoặc hóa
 * đơn của workspace khác (P0002) → `not_found`; không phải Owner (42501) → `forbidden`. Không đổi trạng thái `paid`.
 */
export async function reportTransfer(
  deps: PaymentDeps,
  actor: PaymentActor,
  invoiceId: string,
): Promise<ReportTransferOutcome> {
  if (deps.provider.state !== 'ready') return 'disabled';
  if (!z.uuid().safeParse(invoiceId).success) return 'not_found';
  try {
    return await deps.db.withActor(actor.workspaceId, actor.userId, (tx) =>
      reportInvoiceTransfer(tx, actor.workspaceId, invoiceId),
    );
  } catch (error) {
    const code = pgCode(error);
    if (code === 'P0002') return 'not_found';
    if (code === '42501') return 'forbidden';
    throw error;
  }
}
