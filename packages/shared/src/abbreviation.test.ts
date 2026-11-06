import { describe, expect, it } from 'vitest';
import { ABBREVIATION_SHORT_MAX, mergeAbbreviations, parseAbbreviation } from './abbreviation';

describe('FR-025 FR-050 parseAbbreviation', () => {
  it('chuẩn hóa short (NFC, thường, cắt khoảng trắng), cắt full', () => {
    const r = parseAbbreviation({ short: '  IB ', full: ' inbox ', lang: 'vi' });
    expect(r).toEqual({ success: true, data: { short: 'ib', full: 'inbox', lang: 'vi' } });
  });

  it('đưa chữ có dấu dạng NFD về NFC', () => {
    const r = parseAbbreviation({ short: 'kó', full: 'không', lang: 'vi' });
    expect(r.success && r.data.short).toBe('kó');
  });

  it.each([
    ['short rỗng', { short: '  ', full: 'x', lang: 'vi' }],
    ['short có khoảng trắng', { short: 'a b', full: 'x', lang: 'vi' }],
    ['short quá dài', { short: 'a'.repeat(ABBREVIATION_SHORT_MAX + 1), full: 'x', lang: 'vi' }],
    ['full rỗng', { short: 'ib', full: ' ', lang: 'vi' }],
    ['full quá dài', { short: 'ib', full: 'a'.repeat(101), lang: 'vi' }],
    ['lang lạ', { short: 'ib', full: 'inbox', lang: 'fr' }],
    ['short trùng full', { short: 'ib', full: 'IB', lang: 'vi' }],
    ['thiếu trường', { short: 'ib' }],
  ])('từ chối: %s', (_name, input) => {
    expect(parseAbbreviation(input).success).toBe(false);
  });

  it('chấp nhận đúng ngưỡng độ dài', () => {
    const r = parseAbbreviation({
      short: 'a'.repeat(ABBREVIATION_SHORT_MAX),
      full: 'b'.repeat(100),
      lang: 'en',
    });
    expect(r.success).toBe(true);
  });
});

describe('FR-025 mergeAbbreviations', () => {
  it('mục workspace đè mục hệ thống cùng short; mục khác giữ nguyên', () => {
    const merged = mergeAbbreviations(
      [
        { short: 'ib', full: 'inbox' },
        { short: 'sz', full: 'size' },
      ],
      [
        { short: 'ib', full: 'nhắn tin riêng' },
        { short: 'cod', full: 'thanh toán khi nhận hàng' },
      ],
    );
    expect({ ...merged }).toEqual({
      ib: 'nhắn tin riêng',
      sz: 'size',
      cod: 'thanh toán khi nhận hàng',
    });
  });

  it('rỗng cả hai → rỗng; không đổi đầu vào', () => {
    expect({ ...mergeAbbreviations([], []) }).toEqual({});
    const sys = [{ short: 'ib', full: 'inbox' }];
    mergeAbbreviations(sys, [{ short: 'ib', full: 'x' }]);
    expect(sys).toEqual([{ short: 'ib', full: 'inbox' }]);
  });

  it('không dính khóa nguyên mẫu (__proto__)', () => {
    const merged = mergeAbbreviations([{ short: '__proto__', full: 'x' }], []);
    expect(Object.getPrototypeOf(merged)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(merged, '__proto__')?.value).toBe('x');
  });
});
