import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BANNED_KEYWORDS, scanBannedKeywords } from './banned-keywords';

describe('FR-115 scanBannedKeywords', () => {
  it('khớp có dấu, không dấu, hoa/thường', () => {
    for (const text of ['vay tiền nhanh', 'VAY TIEN nhanh', 'Vay Tiền']) {
      expect(scanBannedKeywords([{ id: 'a', text }])).toEqual([{ id: 'a', keyword: 'vay tiền' }]);
    }
  });
  it('theo ranh giới từ: không khớp giữa chữ khác', () => {
    expect(scanBannedKeywords([{ id: 'a', text: 'xevay tienich' }], ['vay tiền'])).toEqual([]);
  });
  it('mỗi mục chỉ một khớp; không khớp → rỗng', () => {
    expect(scanBannedKeywords([{ id: 'a', text: 'cờ bạc và vay tiền' }])).toHaveLength(1);
    expect(scanBannedKeywords([{ id: 'a', text: 'Áo thun giá 199k, ship toàn quốc' }])).toEqual([]);
  });
  it('danh sách tùy chỉnh; từ khóa rỗng bị bỏ qua', () => {
    expect(scanBannedKeywords([{ id: 'a', text: 'abc xyz' }], ['', '  ', 'xyz'])).toEqual([
      { id: 'a', keyword: 'xyz' },
    ]);
    expect(scanBannedKeywords([{ id: 'a', text: 'abc' }], ['', ' '])).toEqual([]);
  });
  it('property: không ném lỗi, kết quả luôn thuộc danh sách và id đầu vào', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        for (const h of scanBannedKeywords([{ id: 'x', text }])) {
          expect(h.id).toBe('x');
          expect(DEFAULT_BANNED_KEYWORDS).toContain(h.keyword);
        }
      }),
    );
  });
});
