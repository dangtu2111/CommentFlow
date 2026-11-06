import { describe, expect, it } from 'vitest';
import {
  buildVietQrPayload,
  crc16Ccitt,
  type PaymentReceiver,
  parsePaymentReceiver,
  parseTlv,
} from './vietqr';

const receiver: PaymentReceiver = {
  bankBin: '970415',
  accountNumber: '113366668888',
  accountName: 'CONG TY FIXTURE',
};

describe('FR-091 CRC16-CCITT (EMVCo)', () => {
  it('khớp vector chuẩn "123456789" → 29B1', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1');
  });
  it('chuỗi rỗng → FFFF, luôn 4 ký tự hoa', () => {
    expect(crc16Ccitt('')).toBe('FFFF');
    expect(crc16Ccitt('a')).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe('FR-091 payload VietQR', () => {
  const payload = buildVietQrPayload({
    receiver,
    amountVnd: 199000,
    transferCode: 'CFABCD2345',
  });
  const tlv = parseTlv(payload);

  it('có đủ trường: định dạng, động, tiền tệ 704, quốc gia VN', () => {
    expect(tlv.get('00')).toBe('01');
    expect(tlv.get('01')).toBe('12');
    expect(tlv.get('53')).toBe('704');
    expect(tlv.get('58')).toBe('VN');
  });

  it('số tiền là số nguyên VND nguyên văn, nội dung chuyển khoản là mã định danh', () => {
    expect(tlv.get('54')).toBe('199000');
    expect(parseTlv(tlv.get('62') ?? '').get('08')).toBe('CFABCD2345');
  });

  it('tài khoản nhận: GUID NAPAS, BIN, số tài khoản, dịch vụ chuyển nhanh đến tài khoản', () => {
    const merchant = parseTlv(tlv.get('38') ?? '');
    expect(merchant.get('00')).toBe('A000000727');
    const beneficiary = parseTlv(merchant.get('01') ?? '');
    expect(beneficiary.get('00')).toBe('970415');
    expect(beneficiary.get('01')).toBe('113366668888');
    expect(merchant.get('02')).toBe('QRIBFTTA');
  });

  it('kết thúc bằng CRC đúng của phần đứng trước', () => {
    const body = payload.slice(0, -4);
    expect(body.endsWith('6304')).toBe(true);
    expect(payload.slice(-4)).toBe(crc16Ccitt(body));
  });

  it('cùng đầu vào → cùng kết quả (xác định)', () => {
    expect(buildVietQrPayload({ receiver, amountVnd: 199000, transferCode: 'CFABCD2345' })).toBe(
      payload,
    );
  });

  it('đổi số tiền hoặc mã → payload khác', () => {
    expect(
      buildVietQrPayload({ receiver, amountVnd: 199001, transferCode: 'CFABCD2345' }),
    ).not.toBe(payload);
    expect(
      buildVietQrPayload({ receiver, amountVnd: 199000, transferCode: 'CFABCD2346' }),
    ).not.toBe(payload);
  });

  it.each([0, -1, 1.5, Number.NaN, 1_000_000_001])(
    'từ chối số tiền không hợp lệ %s',
    (amountVnd) => {
      expect(() =>
        buildVietQrPayload({ receiver, amountVnd, transferCode: 'CFABCD2345' }),
      ).toThrow();
    },
  );

  it.each(['', 'abc', 'CFABCD234', 'CFABCD23456', 'cfabcd2345', 'ZZABCD2345'])(
    'từ chối mã chuyển khoản sai dạng %j',
    (transferCode) => {
      expect(() => buildVietQrPayload({ receiver, amountVnd: 1000, transferCode })).toThrow();
    },
  );
});

describe('FR-091 tách TLV', () => {
  it.each(['0', '00', '0002', '000A01', '00020', '5'])('từ chối chuỗi hỏng %j', (text) => {
    expect(() => parseTlv(text)).toThrow();
  });
  it('chuỗi rỗng → bảng rỗng; trường độ dài 0 hợp lệ', () => {
    expect(parseTlv('').size).toBe(0);
    expect(parseTlv('0100').get('01')).toBe('');
  });
});

describe('FR-091 cấu hình tài khoản nhận tiền', () => {
  it('chấp nhận cấu hình hợp lệ, cắt khoảng trắng', () => {
    expect(
      parsePaymentReceiver({
        bankBin: ' 970415 ',
        accountNumber: '113366668888',
        accountName: ' CONG TY FIXTURE ',
      }),
    ).toEqual(receiver);
  });

  it.each([
    { bankBin: '97041', accountNumber: '113366668888', accountName: 'A' },
    { bankBin: '97041X', accountNumber: '113366668888', accountName: 'A' },
    { bankBin: '970415', accountNumber: '12345', accountNumber2: 1, accountName: 'A' },
    { bankBin: '970415', accountNumber: '1234567890123456789012', accountName: 'A' },
    { bankBin: '970415', accountNumber: '12AB345678', accountName: 'A' },
    { bankBin: '970415', accountNumber: '113366668888', accountName: '' },
    { bankBin: '970415', accountNumber: '113366668888' },
    null,
    'x',
  ])('từ chối cấu hình sai %#', (input) => {
    expect(() => parsePaymentReceiver(input)).toThrow();
  });
});
