import { describe, expect, it } from 'vitest';
import { buildInvoiceRows, invoiceStatusTone } from './billing-view';

const base = {
  id: 'i1',
  product: 'commentflow',
  number: 'INV-2026-0001',
  amountVnd: 699_000,
  items: [{ description: 'Gói Growth (Tháng 11)', quantity: 1, unitPriceVnd: 699_000 }],
  status: 'paid' as const,
  transferCode: 'CFABCD2345',
  dueAt: new Date('2026-11-10T00:00:00Z'),
  paidAt: new Date('2026-11-02T00:00:00Z'),
  voidedAt: null,
  transferReportedAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
};

describe('FR-091 US-061 dòng lịch sử hóa đơn', () => {
  it('chọn tông màu theo trạng thái', () => {
    expect(invoiceStatusTone('paid')).toBe('success');
    expect(invoiceStatusTone('pending')).toBe('warning');
    expect(invoiceStatusTone('void')).toBe('muted');
  });
  it('FR-091 chờ xác nhận: chỉ hóa đơn pending đã báo chuyển khoản; paid/void không bao giờ "chờ xác nhận"', () => {
    const reported = new Date('2026-11-03T00:00:00Z');
    const pick = (over: object) => buildInvoiceRows([{ ...base, ...over }])[0]?.statusKey;
    expect(pick({ status: 'pending', paidAt: null })).toBe('pending');
    expect(pick({ status: 'pending', paidAt: null, transferReportedAt: reported })).toBe(
      'awaiting',
    );
    expect(pick({ status: 'paid', transferReportedAt: reported })).toBe('paid');
    expect(
      pick({ status: 'void', paidAt: null, voidedAt: reported, transferReportedAt: reported }),
    ).toBe('void');
  });
  it('mô tả lấy từ các dòng hàng, nối bằng dấu phẩy', () => {
    const [row] = buildInvoiceRows([
      {
        ...base,
        items: [
          { description: 'A', quantity: 1, unitPriceVnd: 1 },
          { description: 'B', quantity: 2, unitPriceVnd: 1 },
        ],
      },
    ]);
    expect(row?.description).toBe('A, B');
  });
  it('items hỏng/không phải mảng → mô tả rỗng, không ném lỗi', () => {
    expect(buildInvoiceRows([{ ...base, items: null }])[0]?.description).toBe('');
    expect(buildInvoiceRows([{ ...base, items: [{ x: 1 }] }])[0]?.description).toBe('');
  });
  it('ngày hiển thị: đã trả → paidAt, chưa trả → createdAt (ISO yyyy-mm-dd)', () => {
    expect(buildInvoiceRows([base])[0]?.dateIso).toBe('2026-11-02');
    expect(buildInvoiceRows([{ ...base, status: 'pending', paidAt: null }])[0]?.dateIso).toBe(
      '2026-11-01',
    );
  });
});
