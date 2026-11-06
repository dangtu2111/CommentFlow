import { describe, expect, it, vi } from 'vitest';
import {
  type InvoiceMatch,
  type ReconcileDeps,
  reconcileBankTransaction,
  type SettleOps,
} from './payment-reconcile';

const WS = '11111111-1111-4111-8111-111111111111';
const INV = '22222222-2222-4222-8222-222222222222';
const INV2 = '33333333-3333-4333-8333-333333333333';
const CODE = 'CFABCDEFGH';

const match = (over: Partial<InvoiceMatch> = {}): InvoiceMatch => ({
  workspaceId: WS,
  invoiceId: INV,
  amountVnd: 250000,
  status: 'pending',
  ...over,
});

const tx = (over: Record<string, unknown> = {}) => ({
  bankRef: 'SEPAY:1',
  amountVnd: 250000,
  content: `CK ${CODE} cam on`,
  accountNumber: '000111',
  ...over,
});

function setup(opts: {
  invoices?: Record<string, InvoiceMatch>;
  confirm?: SettleOps['confirm'];
  expectedAccountNumber?: string | null;
}) {
  const confirm = vi.fn(opts.confirm ?? (async () => 'ok' as const));
  const fulfill = vi.fn(async () => undefined);
  const settle = vi.fn(async (_ws: string, fn: (ops: SettleOps) => Promise<unknown>) =>
    fn({ confirm, fulfill }),
  );
  const findInvoice = vi.fn(
    async (code: string) => (opts.invoices ?? { [CODE]: match() })[code] ?? null,
  );
  const deps: ReconcileDeps = {
    findInvoice,
    settle: settle as ReconcileDeps['settle'],
    expectedAccountNumber: opts.expectedAccountNumber,
  };
  return { deps, confirm, fulfill, settle, findInvoice };
}

describe('FR-124 đối soát giao dịch ngân hàng với hóa đơn QR-PAYMENT', () => {
  it('đúng mã + đúng tiền → xác nhận và cộng lượt đúng một lần', async () => {
    const s = setup({});
    await expect(reconcileBankTransaction(tx(), s.deps)).resolves.toBe('confirmed');
    expect(s.confirm).toHaveBeenCalledWith({
      workspaceId: WS,
      invoiceId: INV,
      amountVnd: 250000,
      bankRef: 'SEPAY:1',
      rawStatement: `CK ${CODE} cam on`,
    });
    expect(s.fulfill).toHaveBeenCalledTimes(1);
  });

  it('nội dung bị đổi hoa/thường, chèn khoảng trắng vẫn khớp mã', async () => {
    const s = setup({});
    await expect(reconcileBankTransaction(tx({ content: 'cf abcd-efgh' }), s.deps)).resolves.toBe(
      'confirmed',
    );
  });

  it('không có mã trong nội dung → no_match, không tra DB, không ghi', async () => {
    const s = setup({});
    await expect(reconcileBankTransaction(tx({ content: 'chuyen tien' }), s.deps)).resolves.toBe(
      'no_match',
    );
    expect(s.findInvoice).not.toHaveBeenCalled();
    expect(s.settle).not.toHaveBeenCalled();
  });

  it('có mã nhưng không có hóa đơn → no_match', async () => {
    const s = setup({ invoices: {} });
    await expect(reconcileBankTransaction(tx(), s.deps)).resolves.toBe('no_match');
    expect(s.settle).not.toHaveBeenCalled();
  });

  it('lệch tiền (thiếu hoặc thừa) → amount_mismatch, KHÔNG xác nhận, KHÔNG cộng lượt', async () => {
    for (const amountVnd of [249999, 250001]) {
      const s = setup({});
      await expect(reconcileBankTransaction(tx({ amountVnd }), s.deps)).resolves.toBe(
        'amount_mismatch',
      );
      expect(s.settle).not.toHaveBeenCalled();
      expect(s.fulfill).not.toHaveBeenCalled();
    }
  });

  it('hóa đơn đã trả / đã hủy → không xác nhận lại, không cộng lượt lần hai', async () => {
    const paid = setup({ invoices: { [CODE]: match({ status: 'paid' }) } });
    await expect(reconcileBankTransaction(tx(), paid.deps)).resolves.toBe('already_paid');
    const voided = setup({ invoices: { [CODE]: match({ status: 'void' }) } });
    await expect(reconcileBankTransaction(tx(), voided.deps)).resolves.toBe('void');
    expect(paid.fulfill).not.toHaveBeenCalled();
    expect(voided.fulfill).not.toHaveBeenCalled();
  });

  it('chống trùng: DB báo already_paid (gửi lại đua nhau) → không cộng lượt', async () => {
    const s = setup({ confirm: async () => 'already_paid' });
    await expect(reconcileBankTransaction(tx(), s.deps)).resolves.toBe('already_paid');
    expect(s.fulfill).not.toHaveBeenCalled();
  });

  it('cùng mã giao dịch ngân hàng dùng cho hóa đơn khác → duplicate, không cộng lượt', async () => {
    const s = setup({ confirm: async () => 'duplicate_bank_ref' });
    await expect(reconcileBankTransaction(tx(), s.deps)).resolves.toBe('duplicate');
    expect(s.fulfill).not.toHaveBeenCalled();
  });

  it('nội dung có hai mã trỏ tới hai hóa đơn khác nhau → ambiguous, không tự xác nhận', async () => {
    const s = setup({
      invoices: {
        [CODE]: match(),
        XFZZZZZZZ2: match({ invoiceId: INV2 }),
      },
    });
    await expect(
      reconcileBankTransaction(tx({ content: `${CODE} XFZZZZZZZ2` }), s.deps),
    ).resolves.toBe('ambiguous');
    expect(s.settle).not.toHaveBeenCalled();
  });

  it('nội dung sinh quá nhiều mã ứng viên → ambiguous, không tra DB', async () => {
    const s = setup({});
    const many = Array.from({ length: 6 }, (_, i) => `CFABCDEFG${'HJKLMN'[i]}`).join(' ');
    await expect(reconcileBankTransaction(tx({ content: many }), s.deps)).resolves.toBe(
      'ambiguous',
    );
    expect(s.findInvoice).not.toHaveBeenCalled();
  });

  it('hai ứng viên cùng trỏ một hóa đơn thì không mơ hồ', async () => {
    const s = setup({ invoices: { [CODE]: match(), CFBCDEFGH2: match() } });
    await expect(reconcileBankTransaction(tx({ content: `${CODE}2` }), s.deps)).resolves.toBe(
      'confirmed',
    );
  });

  it('cấu hình số tài khoản nhận tiền: giao dịch vào tài khoản khác → wrong_account', async () => {
    const s = setup({ expectedAccountNumber: '999' });
    await expect(reconcileBankTransaction(tx(), s.deps)).resolves.toBe('wrong_account');
    expect(s.findInvoice).not.toHaveBeenCalled();
    const ok = setup({ expectedAccountNumber: '000111' });
    await expect(reconcileBankTransaction(tx(), ok.deps)).resolves.toBe('confirmed');
  });

  it('cộng lượt lỗi → ném lỗi (giao dịch DB hoàn tác, nhà cung cấp gửi lại), không nuốt', async () => {
    const s = setup({});
    s.fulfill.mockRejectedValueOnce(new Error('boom'));
    await expect(reconcileBankTransaction(tx(), s.deps)).rejects.toThrow('boom');
  });
});
