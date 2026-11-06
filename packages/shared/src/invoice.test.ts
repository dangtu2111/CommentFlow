import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeInvoiceTotal,
  evaluatePayment,
  extractTransferCodes,
  generateTransferCode,
  INVOICE_ITEMS_MAX,
  INVOICE_MAX_AMOUNT_VND,
  isTransferCode,
  parseConfirmPayment,
  parseCreateInvoice,
  TRANSFER_CODE_ALPHABET,
} from './invoice';

const item = (quantity: number, unitPriceVnd: number, description = 'Gói Starter') => ({
  description,
  quantity,
  unitPriceVnd,
});

const bytesArb = fc.uint8Array({ minLength: 8, maxLength: 8 });
const fromBytes = (b: Uint8Array) => () => b;
const productArb = fc.constantFrom('commentflow' as const, 'excelflow' as const);

describe('FR-091 tính tổng hóa đơn', () => {
  it('cộng số lượng × đơn giá nguyên VND', () => {
    expect(computeInvoiceTotal([item(1, 299_000), item(2, 149_000)])).toBe(597_000);
  });

  it('bất biến: tổng = Σ qty×giá và không phụ thuộc thứ tự mục', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 1_000_000 })),
          { minLength: 1, maxLength: INVOICE_ITEMS_MAX },
        ),
        (pairs) => {
          const items = pairs.map(([q, p]) => item(q, p));
          const expected = pairs.reduce((s, [q, p]) => s + q * p, 0);
          expect(computeInvoiceTotal(items)).toBe(expected);
          expect(computeInvoiceTotal([...items].reverse())).toBe(expected);
        },
      ),
    );
  });

  it('từ chối danh sách rỗng, mục sai, tổng ≤ 0 hoặc vượt trần', () => {
    expect(() => computeInvoiceTotal([])).toThrow();
    expect(() => computeInvoiceTotal([item(0, 100)])).toThrow();
    expect(() => computeInvoiceTotal([item(1, -1)])).toThrow();
    expect(() => computeInvoiceTotal([item(1.5, 100)])).toThrow();
    expect(() => computeInvoiceTotal([item(1, 0)])).toThrow();
    expect(() => computeInvoiceTotal([item(1, INVOICE_MAX_AMOUNT_VND + 1)])).toThrow();
    expect(() => computeInvoiceTotal([item(2, INVOICE_MAX_AMOUNT_VND)])).toThrow();
    expect(() => computeInvoiceTotal([item(1, 1, '')])).toThrow();
    expect(() =>
      computeInvoiceTotal(Array.from({ length: INVOICE_ITEMS_MAX + 1 }, () => item(1, 1))),
    ).toThrow();
  });
});

describe('FR-091 mã chuyển khoản định danh', () => {
  it('sinh đúng định dạng theo sản phẩm, chỉ dùng ký tự không nhầm lẫn', () => {
    fc.assert(
      fc.property(bytesArb, productArb, (b, product) => {
        const code = generateTransferCode(product, fromBytes(b));
        expect(code).toMatch(/^(CF|XF)[A-HJ-NP-Z2-9]{8}$/);
        expect(code.startsWith(product === 'commentflow' ? 'CF' : 'XF')).toBe(true);
        expect(isTransferCode(code)).toBe(true);
        for (const ch of code.slice(2)) expect(TRANSFER_CODE_ALPHABET).toContain(ch);
      }),
    );
  });

  it('ném lỗi nếu nguồn ngẫu nhiên trả sai số byte', () => {
    expect(() => generateTransferCode('commentflow', () => new Uint8Array(3))).toThrow();
  });

  it('isTransferCode từ chối chữ thường, ký tự dễ nhầm, sai độ dài, sai tiền tố', () => {
    expect(isTransferCode('cfabcdefgh')).toBe(false);
    expect(isTransferCode('CFABCDEFG0')).toBe(false);
    expect(isTransferCode('CFABCDEFG')).toBe(false);
    expect(isTransferCode('ZZABCDEFGH')).toBe(false);
  });

  it('nhận diện mã trong nội dung sao kê dù đổi hoa/thường, chèn khoảng trắng/gạch', () => {
    fc.assert(
      fc.property(bytesArb, fc.constantFrom(' ', '-', ''), (b, sep) => {
        const code = generateTransferCode('commentflow', fromBytes(b));
        const spaced = `${code.slice(0, 2)}${sep}${code.slice(2, 6)}${sep}${code.slice(6)}`;
        const text = `MBVCB.123 NGUYEN VAN A chuyen tien ${spaced.toLowerCase()} cam on`;
        expect(extractTransferCodes(text)).toContain(code);
      }),
    );
  });

  it('không tìm thấy mã trong văn bản không liên quan; trả mã duy nhất, giữ thứ tự', () => {
    expect(extractTransferCodes('chuyen khoan tien nha thang 11')).toEqual([]);
    expect(extractTransferCodes('')).toEqual([]);
    expect(extractTransferCodes('CFABCDEFGH cfabcdefgh XFJKLMNPQR')).toEqual([
      'CFABCDEFGH',
      'XFJKLMNPQR',
    ]);
  });
});

describe('FR-091/FR-102 đối soát thanh toán', () => {
  const inv = (status: 'pending' | 'paid' | 'void', amountVnd = 299_000) => ({
    status,
    amountVnd,
  });

  it('đúng số tiền và hóa đơn pending → ok', () => {
    expect(evaluatePayment(inv('pending'), 299_000)).toBe('ok');
  });

  it('lệch tiền (thiếu hoặc thừa) → amount_mismatch', () => {
    expect(evaluatePayment(inv('pending'), 298_999)).toBe('amount_mismatch');
    expect(evaluatePayment(inv('pending'), 299_001)).toBe('amount_mismatch');
  });

  it('đã trả → already_paid; hủy → void (kể cả khi số tiền đúng)', () => {
    expect(evaluatePayment(inv('paid'), 299_000)).toBe('already_paid');
    expect(evaluatePayment(inv('void'), 299_000)).toBe('void');
  });

  it('bất biến: chỉ pending + đúng tiền mới ok', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pending' as const, 'paid' as const, 'void' as const),
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (status, amount, paid) => {
          const r = evaluatePayment(inv(status, amount), paid);
          expect(r === 'ok').toBe(status === 'pending' && amount === paid);
        },
      ),
    );
  });
});

describe('FR-102 đầu vào xác nhận thanh toán', () => {
  const ok = {
    workspaceId: '8f14e45f-ceea-467a-9575-0f6b1f3e0001',
    invoiceId: '8f14e45f-ceea-467a-9575-0f6b1f3e0002',
    amountVnd: 299_000,
    bankRef: '  ft123abc ',
  };

  it('chuẩn hóa mã giao dịch (cắt, viết hoa); mặc định rawStatement/confirmedBy = null', () => {
    expect(parseConfirmPayment(ok)).toMatchObject({
      bankRef: 'FT123ABC',
      rawStatement: null,
      confirmedBy: null,
    });
  });

  it('bất biến: mọi biến thể hoa/thường/khoảng trắng của một mã cho cùng kết quả', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9]{1,30}$/),
        fc.constantFrom('', ' ', '  '),
        (ref, pad) => {
          const a = parseConfirmPayment({ ...ok, bankRef: `${pad}${ref}${pad}` }).bankRef;
          const b = parseConfirmPayment({ ...ok, bankRef: ref.toLowerCase() }).bankRef;
          expect(a).toBe(b);
        },
      ),
    );
  });

  it('giữ rawStatement và confirmedBy hợp lệ', () => {
    const r = parseConfirmPayment({
      ...ok,
      rawStatement: 'ND CF2345ABCD',
      confirmedBy: '8f14e45f-ceea-467a-9575-0f6b1f3e0003',
    });
    expect(r.rawStatement).toBe('ND CF2345ABCD');
    expect(r.confirmedBy).toBe('8f14e45f-ceea-467a-9575-0f6b1f3e0003');
  });

  it('từ chối uuid/số tiền/mã giao dịch sai', () => {
    expect(() => parseConfirmPayment({ ...ok, invoiceId: 'x' })).toThrow();
    expect(() => parseConfirmPayment({ ...ok, amountVnd: 0 })).toThrow();
    expect(() => parseConfirmPayment({ ...ok, amountVnd: 1.5 })).toThrow();
    expect(() => parseConfirmPayment({ ...ok, bankRef: '   ' })).toThrow();
    expect(() => parseConfirmPayment({ ...ok, rawStatement: 'x'.repeat(2001) })).toThrow();
  });
});

describe('FR-091 đầu vào tạo hóa đơn', () => {
  const base = {
    workspaceId: '8f14e45f-ceea-467a-9575-0f6b1f3e0001',
    product: 'commentflow',
    items: [item(1, 299_000)],
    dueAt: new Date('2026-12-01T00:00:00Z'),
  };

  it('hợp lệ → có amountVnd tính từ mục', () => {
    const r = parseCreateInvoice(base);
    expect(r.amountVnd).toBe(299_000);
    expect(r.product).toBe('commentflow');
  });

  it('từ chối workspace/sản phẩm/ngày sai', () => {
    expect(() => parseCreateInvoice({ ...base, workspaceId: 'x' })).toThrow();
    expect(() => parseCreateInvoice({ ...base, product: 'tiktok' })).toThrow();
    expect(() => parseCreateInvoice({ ...base, dueAt: new Date('nope') })).toThrow();
    expect(() => parseCreateInvoice({ ...base, items: [] })).toThrow();
  });
});
