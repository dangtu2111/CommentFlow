import { type ReconcileDeps, reconcileBankTransaction } from '@flow/saas-core';
import { createBankWebhookHandler } from './bank-webhook';

/**
 * Nối webhook ngân hàng (FR-124) với đối soát. TRẠNG THÁI: Xong-mock — kho hóa đơn cho đối soát chưa có.
 *
 * Tra hóa đơn theo mã chuyển khoản khi CHƯA biết workspace cần hàm DEFINER mới trong DB (RLS chỉ cho đọc trong
 * workspace đã biết) + hàm cộng lượt theo hóa đơn → cần migration của làn b (gap `AUTO-PAYMENT-CONFIRM-DB`).
 * Đến lúc đó `settleStore` là `null` → webhook trả 503 dù cờ bật (đóng, không bao giờ chấp nhận khi chưa nối được).
 * Khi có migration: gán `settleStore` (findInvoice + settle) dựng trên `withJob` + `confirmInvoicePayment` +
 * `grantUsageAddon`/`activatePlan`; không cần sửa handler, route hay test.
 */
const settleStore: Pick<ReconcileDeps, 'findInvoice' | 'settle'> | null = null;

const flagOn = (): boolean => process.env.BANK_WEBHOOK_ENABLED?.trim() === 'true';
const accountNumber = (): string | null => process.env.PAYMENT_ACCOUNT_NUMBER?.trim() || null;

/** Khóa ngắn hơn 16 ký tự coi như chưa cấu hình (đóng). */
const longEnough = (v: string | undefined): string | undefined =>
  v && v.trim().length >= 16 ? v.trim() : undefined;

function build(provider: 'sepay' | 'casso', secretName: string) {
  return createBankWebhookHandler({
    provider,
    // Đóng khi thiếu số tài khoản nhận tiền: không để tiền vào tài khoản khác xác nhận được hóa đơn.
    enabled: () => flagOn() && settleStore !== null && accountNumber() !== null,
    secret: () => longEnough(process.env[secretName]),
    reconcile: (tx) => {
      if (!settleStore) throw new Error('bank_settle_store_unavailable');
      return reconcileBankTransaction(tx, {
        ...settleStore,
        expectedAccountNumber: accountNumber(),
      });
    },
    warn: (event) => console.warn(JSON.stringify(event)),
  });
}

export const bankWebhookHandlers = {
  sepay: build('sepay', 'SEPAY_WEBHOOK_API_KEY'),
  casso: build('casso', 'CASSO_WEBHOOK_SECURE_TOKEN'),
};
