import { describe, expect, it } from 'vitest';
import {
  parseCassoPayload,
  parseSepayPayload,
  verifyCassoToken,
  verifySepayAuth,
} from './bank-webhook';

// Fixture: giá trị ngắn/dựng lúc chạy để không giống khóa thật (gitleaks).
const KEY = ['k', 'test'].join('-');

const sepay = (over: Record<string, unknown> = {}) => ({
  id: 9001,
  gateway: 'BankX',
  accountNumber: '000111',
  content: 'CK CFABCDEFGH',
  transferType: 'in',
  transferAmount: 250000,
  referenceCode: 'FT-1',
  ...over,
});

describe('FR-124 xác minh khóa webhook SePay', () => {
  it('đúng "Apikey <khóa>" thì qua', () => {
    expect(verifySepayAuth(`Apikey ${KEY}`, KEY)).toBe(true);
  });
  it.each([null, '', 'Apikey', `Bearer ${KEY}`, `Apikey ${KEY}x`, `apikey ${KEY}`])(
    'sai/thiếu (%s) thì từ chối',
    (header) => {
      expect(verifySepayAuth(header, KEY)).toBe(false);
    },
  );
  it('khóa cấu hình rỗng thì luôn từ chối (đóng)', () => {
    expect(verifySepayAuth('Apikey ', '')).toBe(false);
    expect(verifySepayAuth('Apikey', '')).toBe(false);
  });
});

describe('FR-124 xác minh secure-token Casso', () => {
  it('đúng token thì qua, sai/thiếu/rỗng thì từ chối', () => {
    expect(verifyCassoToken(KEY, KEY)).toBe(true);
    expect(verifyCassoToken(`${KEY}x`, KEY)).toBe(false);
    expect(verifyCassoToken(null, KEY)).toBe(false);
    expect(verifyCassoToken('', '')).toBe(false);
  });
});

describe('FR-124 parse payload SePay', () => {
  it('tiền vào hợp lệ → giao dịch chuẩn hóa, mã giao dịch có tiền tố nhà cung cấp', () => {
    expect(parseSepayPayload(sepay())).toEqual({
      provider: 'sepay',
      bankRef: 'SEPAY:9001',
      amountVnd: 250000,
      content: 'CK CFABCDEFGH',
      accountNumber: '000111',
    });
  });
  it('tiền ra, số tiền sai/không nguyên/≤0, thiếu id → bỏ qua (null)', () => {
    expect(parseSepayPayload(sepay({ transferType: 'out' }))).toBeNull();
    expect(parseSepayPayload(sepay({ transferAmount: 0 }))).toBeNull();
    expect(parseSepayPayload(sepay({ transferAmount: 10.5 }))).toBeNull();
    expect(parseSepayPayload(sepay({ transferAmount: '250000' }))).toBeNull();
    expect(parseSepayPayload(sepay({ id: undefined }))).toBeNull();
    expect(parseSepayPayload('x')).toBeNull();
  });
  it('nội dung thiếu → chuỗi rỗng (vẫn là giao dịch, sẽ không khớp hóa đơn)', () => {
    expect(parseSepayPayload(sepay({ content: undefined }))?.content).toBe('');
  });
  it('số tài khoản thiếu hoặc null → accountNumber null', () => {
    expect(parseSepayPayload(sepay({ accountNumber: undefined }))?.accountNumber).toBeNull();
    expect(parseSepayPayload(sepay({ accountNumber: null }))?.accountNumber).toBeNull();
  });
});

describe('FR-124 parse payload Casso', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 77,
    tid: 'T1',
    description: 'CF ABCD EFGH',
    amount: 250000,
    bank_sub_acc_id: '000111',
    ...over,
  });
  it('mỗi dòng tiền vào là một giao dịch; tiền ra/dòng hỏng bị bỏ', () => {
    const body = {
      error: 0,
      data: [row(), row({ id: 78, amount: -5 }), row({ id: 79, amount: 'x' }), 5],
    };
    expect(parseCassoPayload(body)).toEqual([
      {
        provider: 'casso',
        bankRef: 'CASSO:77',
        amountVnd: 250000,
        content: 'CF ABCD EFGH',
        accountNumber: '000111',
      },
    ]);
  });
  it('mô tả và tài khoản phụ thiếu/null → content rỗng, accountNumber null', () => {
    for (const missing of [undefined, null]) {
      const [tx] = parseCassoPayload({
        data: [row({ description: missing, bank_sub_acc_id: missing })],
      });
      expect(tx?.content).toBe('');
      expect(tx?.accountNumber).toBeNull();
    }
  });
  it('thân không đúng dạng → mảng rỗng', () => {
    expect(parseCassoPayload(null)).toEqual([]);
    expect(parseCassoPayload({ data: 'x' })).toEqual([]);
  });
  it('mô tả và tài khoản phụ thiếu → content rỗng, accountNumber null', () => {
    const [tx] = parseCassoPayload({
      data: [row({ description: undefined, bank_sub_acc_id: undefined })],
    });
    expect(tx?.content).toBe('');
    expect(tx?.accountNumber).toBeNull();
  });
});
