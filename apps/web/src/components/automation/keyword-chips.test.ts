import { describe, expect, it } from 'vitest';
import { addKeywords } from './keyword-chips';

describe('KeywordChips addKeywords', () => {
  it('tách theo dấu phẩy/dòng, cắt khoảng trắng, bỏ rỗng', () => {
    expect(addKeywords(['phốt'], ' lừa đảo ,, hoàn tiền\n ')).toEqual([
      'phốt',
      'lừa đảo',
      'hoàn tiền',
    ]);
  });
  it('bỏ từ trùng (không phân biệt hoa thường) và từ quá 60 ký tự', () => {
    expect(addKeywords(['Phốt'], 'phốt, ' + 'a'.repeat(61))).toEqual(['Phốt']);
  });
  it('dừng ở 50 từ', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `k${i}`);
    expect(addKeywords(fifty, 'thêm')).toHaveLength(50);
  });
});
