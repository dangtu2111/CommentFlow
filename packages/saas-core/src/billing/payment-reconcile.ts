import { evaluatePayment, extractTransferCodes, type InvoiceStatus } from '@flow/shared';

/**
 * Tự đối soát giao dịch ngân hàng với hóa đơn QR-PAYMENT (FR-124): khớp nội dung định danh (`CF`/`XF` + 8 ký tự), chỉ
 * đúng số tiền mới xác nhận, chống trùng, rồi cộng lượt. Logic thuần: DB/hàng đợi đi qua `ReconcileDeps` (nguyên tắc
 * tầng); AI không tham gia (nguyên tắc #4). Lệch tiền KHÔNG tự đánh dấu đã trả (người xác nhận xử lý tay).
 *
 * Chống trùng nhiều lớp: (1) hóa đơn `paid` thì dừng sớm; (2) DB `core.confirm_invoice_payment` khóa dòng hóa đơn nên
 * gửi lại/đua nhau chỉ MỘT lần `ok`; (3) `bank_ref` unique toàn hệ thống. Cộng lượt chạy CÙNG giao dịch với xác nhận
 * và chỉ khi `ok` → lỗi cộng lượt hoàn tác cả xác nhận, nhà cung cấp gửi lại sẽ xử lý lại trọn vẹn.
 */
export type BankTransactionInput = {
  /** Mã giao dịch duy nhất (đã có tiền tố nhà cung cấp). */
  bankRef: string;
  amountVnd: number;
  /** Nội dung sao kê gốc: không log, không gửi LLM (nguyên tắc #6). */
  content: string;
  accountNumber: string | null;
};

export type InvoiceMatch = {
  workspaceId: string;
  invoiceId: string;
  amountVnd: number;
  status: InvoiceStatus;
};

export type ConfirmOutcome =
  | 'ok'
  | 'amount_mismatch'
  | 'already_paid'
  | 'void'
  | 'duplicate_bank_ref';

export type SettleOps = {
  confirm(input: {
    workspaceId: string;
    invoiceId: string;
    amountVnd: number;
    bankRef: string;
    rawStatement: string;
  }): Promise<ConfirmOutcome>;
  /** Cộng lượt/kích hoạt gói cho hóa đơn vừa `ok`. Gọi đúng một lần cho mỗi hóa đơn. */
  fulfill(invoice: InvoiceMatch): Promise<void>;
};

export type ReconcileDeps = {
  /** Tìm hóa đơn theo mã chuyển khoản, KHÔNG biết trước workspace (tra theo mã). */
  findInvoice(transferCode: string): Promise<InvoiceMatch | null>;
  /** Chạy `fn` trong MỘT giao dịch hệ thống của workspace (`withJob`); ném lỗi thì hoàn tác. */
  settle<T>(workspaceId: string, fn: (ops: SettleOps) => Promise<T>): Promise<T>;
  /** Số tài khoản nhận tiền cấu hình; có giá trị thì giao dịch vào tài khoản khác bị bỏ qua. */
  expectedAccountNumber?: string | null;
};

export type ReconcileOutcome =
  | 'confirmed'
  | 'no_match'
  | 'ambiguous'
  | 'amount_mismatch'
  | 'already_paid'
  | 'void'
  | 'duplicate'
  | 'wrong_account';

async function findUniqueInvoice(
  content: string,
  findInvoice: ReconcileDeps['findInvoice'],
): Promise<InvoiceMatch | 'none' | 'ambiguous'> {
  const found = new Map<string, InvoiceMatch>();
  for (const code of extractTransferCodes(content)) {
    const invoice = await findInvoice(code);
    if (invoice) found.set(invoice.invoiceId, invoice);
  }
  if (found.size === 0) return 'none';
  if (found.size > 1) return 'ambiguous';
  return [...found.values()][0] as InvoiceMatch;
}

export async function reconcileBankTransaction(
  tx: BankTransactionInput,
  deps: ReconcileDeps,
): Promise<ReconcileOutcome> {
  if (deps.expectedAccountNumber && tx.accountNumber !== deps.expectedAccountNumber) {
    return 'wrong_account';
  }
  const invoice = await findUniqueInvoice(tx.content, deps.findInvoice);
  if (invoice === 'none') return 'no_match';
  if (invoice === 'ambiguous') return 'ambiguous';

  const verdict = evaluatePayment(invoice, tx.amountVnd);
  if (verdict !== 'ok') return verdict;

  return deps.settle(invoice.workspaceId, async (ops) => {
    const result = await ops.confirm({
      workspaceId: invoice.workspaceId,
      invoiceId: invoice.invoiceId,
      amountVnd: tx.amountVnd,
      bankRef: tx.bankRef,
      rawStatement: tx.content,
    });
    if (result === 'duplicate_bank_ref') return 'duplicate';
    if (result !== 'ok') return result;
    await ops.fulfill(invoice);
    return 'confirmed';
  });
}
