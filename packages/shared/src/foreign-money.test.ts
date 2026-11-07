import { describe, expect, it } from 'vitest';
import { currencyExponent, formatMinorAmount, parseDecimalMinor } from './foreign-money';

describe('currencyExponent — số chữ số thập phân của đơn vị nhỏ nhất', () => {
  it.each([
    ['USD', 2],
    ['EUR', 2],
    ['JPY', 0],
    ['KRW', 0],
    ['KWD', 3],
    ['VND', 0],
  ])('%s → %i', (code, exp) => {
    expect(currencyExponent(code)).toBe(exp);
  });

  it('mã không đúng 3 chữ cái hoa → null (không đoán)', () => {
    for (const bad of ['usd', 'US', 'USDX', '', '12A', 'US$']) {
      expect(currencyExponent(bad)).toBeNull();
    }
  });
});

describe('parseDecimalMinor — chuỗi thập phân Shopify → đơn vị nhỏ nhất, chính xác, không dùng số thực', () => {
  it.each([
    ['12.99', 'USD', 1299],
    ['15.00', 'USD', 1500],
    ['15', 'USD', 1500],
    ['0.5', 'USD', 50],
    ['0.00', 'USD', 0],
    ['1500.0', 'JPY', 1500],
    ['1500', 'JPY', 1500],
    ['1.234', 'KWD', 1234],
    ['19.990', 'USD', 1999], // số 0 thừa ở đuôi được bỏ
    ['123456789012.99', 'USD', 12345678901299],
  ])('%s %s → %i', (raw, code, expected) => {
    expect(parseDecimalMinor(raw, code)).toBe(expected);
  });

  it.each([
    ['12.999', 'USD'], // quá độ chính xác của tiền tệ
    ['0.5', 'JPY'],
    ['-5', 'USD'],
    ['1e3', 'USD'],
    ['1,000.00', 'USD'],
    ['abc', 'USD'],
    ['', 'USD'],
    [' ', 'USD'],
    ['9999999999999.00', 'USD'], // > 12 chữ số phần nguyên
    ['12.99', 'usd'],
    [null, 'USD'],
    [undefined, 'USD'],
  ])('không hợp lệ %j %s → null', (raw, code) => {
    expect(parseDecimalMinor(raw as never, code)).toBeNull();
  });

  it('cắt khoảng trắng hai đầu', () => {
    expect(parseDecimalMinor(' 12.99 ', 'USD')).toBe(1299);
  });
});

describe('formatMinorAmount — chữ hiển thị trong câu nguồn của AI', () => {
  it.each([
    [1299, 'USD', '12.99 USD'],
    [1500, 'USD', '15.00 USD'],
    [5, 'USD', '0.05 USD'],
    [0, 'USD', '0.00 USD'],
    [1500, 'JPY', '1500 JPY'],
    [1234, 'KWD', '1.234 KWD'],
    [12345678901299, 'USD', '123456789012.99 USD'],
  ])('%i %s → %s', (amount, code, expected) => {
    expect(formatMinorAmount(amount, code)).toBe(expected);
  });

  it('đầu vào hỏng → null (không bịa số)', () => {
    expect(formatMinorAmount(-1, 'USD')).toBeNull();
    expect(formatMinorAmount(1.5, 'USD')).toBeNull();
    expect(formatMinorAmount(100, 'usd')).toBeNull();
    expect(formatMinorAmount(Number.NaN, 'USD')).toBeNull();
  });

  it('vòng tròn: parse rồi format cho lại đúng chuỗi chuẩn', () => {
    for (const [raw, code] of [
      ['12.99', 'USD'],
      ['15.00', 'USD'],
      ['1500', 'JPY'],
      ['1.234', 'KWD'],
    ] as const) {
      const minor = parseDecimalMinor(raw, code) as number;
      const text = formatMinorAmount(minor, code) as string;
      expect(parseDecimalMinor(text.replace(` ${code}`, ''), code)).toBe(minor);
    }
  });
});
