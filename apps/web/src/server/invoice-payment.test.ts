import type { InvoiceRow } from '@flow/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listInvoices = vi.fn();
const reportInvoiceTransfer = vi.fn();
vi.mock('@flow/db/runtime', () => ({
  listInvoices: (...a: unknown[]) => listInvoices(...a),
  reportInvoiceTransfer: (...a: unknown[]) => reportInvoiceTransfer(...a),
}));

const { envPaymentReceiverProvider, loadPaymentCard, reportTransfer } = await import(
  './invoice-payment'
);

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const TX = { tx: true };
const FULL_ENV = {
  QR_PAYMENT_ENABLED: 'true',
  PAYMENT_BANK_BIN: '970415',
  PAYMENT_ACCOUNT_NUMBER: '113366668888',
  PAYMENT_ACCOUNT_NAME: 'CONG TY FIXTURE',
};

const invoice = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: '33333333-3333-4333-8333-333333333333',
  product: 'commentflow',
  number: 'INV-202611-000001',
  amountVnd: 299_000,
  items: [],
  status: 'pending',
  transferCode: 'CFABCD2345',
  dueAt: new Date('2026-12-01T00:00:00Z'),
  transferReportedAt: null,
  paidAt: null,
  voidedAt: null,
  createdAt: new Date('2026-11-06T00:00:00Z'),
  ...over,
});

function deps(env: Record<string, string | undefined> = FULL_ENV) {
  const withActor = vi.fn(async (_ws: string, _u: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(TX),
  );
  const render = vi.fn(async () => ({ payload: 'PAYLOAD', dataUrl: 'data:image/png;base64,AAAA' }));
  return {
    d: {
      db: { withActor } as never,
      provider: envPaymentReceiverProvider(env),
      render,
    },
    withActor,
    render,
  };
}
const ctx = { workspaceId: WS, userId: USER };

beforeEach(() => {
  listInvoices.mockReset();
  reportInvoiceTransfer.mockReset();
});

describe('FR-091 cấu hình tài khoản nhận tiền (cờ mặc định TẮT)', () => {
  it('thiếu cờ hoặc khác đúng chữ true → disabled, không đọc biến khác', () => {
    for (const v of [undefined, '', 'false', 'TRUE', '1', ' yes ']) {
      expect(envPaymentReceiverProvider({ ...FULL_ENV, QR_PAYMENT_ENABLED: v }).state).toBe(
        'disabled',
      );
    }
    expect(envPaymentReceiverProvider({}).state).toBe('disabled');
  });
  it('bật nhưng thiếu/sai cấu hình → unavailable (đóng, không ném lỗi, không lộ giá trị)', () => {
    expect(envPaymentReceiverProvider({ QR_PAYMENT_ENABLED: 'true' }).state).toBe('unavailable');
    expect(envPaymentReceiverProvider({ ...FULL_ENV, PAYMENT_BANK_BIN: '12' }).state).toBe(
      'unavailable',
    );
    expect(
      envPaymentReceiverProvider({ ...FULL_ENV, PAYMENT_ACCOUNT_NUMBER: undefined }).state,
    ).toBe('unavailable');
  });
  it('bật + đủ cấu hình → ready kèm tài khoản đã chuẩn hóa', () => {
    const p = envPaymentReceiverProvider({
      ...FULL_ENV,
      PAYMENT_ACCOUNT_NAME: ' CONG TY FIXTURE ',
    });
    expect(p).toEqual({
      state: 'ready',
      receiver: {
        bankBin: '970415',
        accountNumber: '113366668888',
        accountName: 'CONG TY FIXTURE',
      },
    });
  });
});

describe('FR-091 thẻ thanh toán của hóa đơn đang chờ', () => {
  it('cờ TẮT → disabled, không đọc DB, không dựng QR', async () => {
    const { d, withActor, render } = deps({});
    expect(await loadPaymentCard(d, ctx)).toEqual({ state: 'disabled' });
    expect(withActor).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('thiếu cấu hình → unavailable, không dựng QR', async () => {
    const { d, render } = deps({ QR_PAYMENT_ENABLED: 'true' });
    expect(await loadPaymentCard(d, ctx)).toEqual({ state: 'unavailable' });
    expect(render).not.toHaveBeenCalled();
  });

  it('đọc hóa đơn bằng withActor của đúng workspace + người dùng; dựng QR từ số tiền/mã trong DB', async () => {
    listInvoices.mockResolvedValue([invoice()]);
    const { d, withActor, render } = deps();
    const card = await loadPaymentCard(d, ctx);
    expect(withActor).toHaveBeenCalledWith(WS, USER, expect.any(Function));
    expect(listInvoices).toHaveBeenCalledWith(TX, WS, expect.any(Number));
    expect(render).toHaveBeenCalledWith({
      receiver: {
        bankBin: '970415',
        accountNumber: '113366668888',
        accountName: 'CONG TY FIXTURE',
      },
      amountVnd: 299_000,
      transferCode: 'CFABCD2345',
    });
    expect(card).toEqual({
      state: 'ready',
      invoice: {
        id: '33333333-3333-4333-8333-333333333333',
        number: 'INV-202611-000001',
        amountVnd: 299_000,
        transferCode: 'CFABCD2345',
        reported: false,
      },
      receiver: {
        bankBin: '970415',
        accountNumber: '113366668888',
        accountName: 'CONG TY FIXTURE',
      },
      qrDataUrl: 'data:image/png;base64,AAAA',
    });
  });

  it('chọn hóa đơn pending mới nhất, bỏ qua paid/void; đã báo chuyển khoản → reported', async () => {
    listInvoices.mockResolvedValue([
      invoice({ id: 'a', status: 'paid', paidAt: new Date() }),
      invoice({ id: 'b', transferReportedAt: new Date('2026-11-06T01:00:00Z') }),
      invoice({ id: 'c' }),
    ]);
    const card = await loadPaymentCard(deps().d, ctx);
    expect(card.state === 'ready' && card.invoice.id).toBe('b');
    expect(card.state === 'ready' && card.invoice.reported).toBe(true);
  });

  it('không có hóa đơn pending → none', async () => {
    listInvoices.mockResolvedValue([invoice({ status: 'void', voidedAt: new Date() })]);
    expect(await loadPaymentCard(deps().d, ctx)).toEqual({ state: 'none' });
    listInvoices.mockResolvedValue([]);
    expect(await loadPaymentCard(deps().d, ctx)).toEqual({ state: 'none' });
  });

  it('Staff/không đọc được hóa đơn (RLS trả rỗng) → none, không lộ QR', async () => {
    listInvoices.mockResolvedValue([]);
    const { d, render } = deps();
    expect(await loadPaymentCard(d, ctx)).toEqual({ state: 'none' });
    expect(render).not.toHaveBeenCalled();
  });

  it('dựng QR lỗi → unavailable (không làm hỏng trang)', async () => {
    listInvoices.mockResolvedValue([invoice()]);
    const { d, render } = deps();
    render.mockRejectedValue(new Error('boom'));
    expect(await loadPaymentCard(d, ctx)).toEqual({ state: 'unavailable' });
  });
});

describe('FR-091 báo đã chuyển khoản', () => {
  it('cờ TẮT hoặc thiếu cấu hình → disabled, không gọi DB', async () => {
    const off = deps({});
    expect(await reportTransfer(off.d, ctx, 'x')).toBe('disabled');
    const noCfg = deps({ QR_PAYMENT_ENABLED: 'true' });
    expect(await reportTransfer(noCfg.d, ctx, 'x')).toBe('disabled');
    expect(off.withActor).not.toHaveBeenCalled();
    expect(noCfg.withActor).not.toHaveBeenCalled();
  });

  it('id không phải uuid → not_found, không gọi DB', async () => {
    const { d, withActor } = deps();
    expect(await reportTransfer(d, ctx, "1' OR '1'='1")).toBe('not_found');
    expect(withActor).not.toHaveBeenCalled();
  });

  it('gọi hàm DB bằng withActor đúng workspace/người dùng và trả kết quả', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    for (const r of ['ok', 'already_reported', 'paid', 'void'] as const) {
      reportInvoiceTransfer.mockResolvedValueOnce(r);
      const { d, withActor } = deps();
      expect(await reportTransfer(d, ctx, id)).toBe(r);
      expect(withActor).toHaveBeenCalledWith(WS, USER, expect.any(Function));
      expect(reportInvoiceTransfer).toHaveBeenLastCalledWith(TX, WS, id);
    }
  });

  it('P0002 (hóa đơn workspace khác/không có) → not_found; lỗi quyền 42501 → forbidden; lỗi khác ném tiếp', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    reportInvoiceTransfer.mockRejectedValueOnce({ cause: { code: 'P0002' } });
    expect(await reportTransfer(deps().d, ctx, id)).toBe('not_found');
    reportInvoiceTransfer.mockRejectedValueOnce({ cause: { code: '42501' } });
    expect(await reportTransfer(deps().d, ctx, id)).toBe('forbidden');
    reportInvoiceTransfer.mockRejectedValueOnce(new Error('db down'));
    await expect(reportTransfer(deps().d, ctx, id)).rejects.toThrow('db down');
  });
});
