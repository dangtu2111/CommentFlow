import { describe, expect, it } from 'vitest';
import { analyzePolicyTexts, MAX_ANALYZE_CHARS } from './kb-policy-analyze';

describe('analyzePolicyTexts', () => {
  it('không có văn bản (hoặc chỉ khoảng trắng) → 0 văn bản, không đề xuất', () => {
    expect(analyzePolicyTexts([])).toEqual({ textCount: 0, suggestions: [] });
    expect(analyzePolicyTexts([{ title: 'a', content: '   ' }])).toEqual({
      textCount: 0,
      suggestions: [],
    });
  });

  it('rút giá trị có cấu trúc kèm nguyên văn câu làm bằng chứng, nhiều văn bản gộp lại', () => {
    const out = analyzePolicyTexts([
      { title: 'Đổi trả', content: 'Khách được đổi trả trong 7 ngày kể từ khi nhận hàng.' },
      { title: 'Bảo hành', content: 'Sản phẩm được bảo hành 12 tháng.' },
    ]);
    expect(out.textCount).toBe(2);
    const kinds = out.suggestions.map((s) => s.kind);
    expect(kinds).toContain('returns');
    expect(kinds).toContain('warranty');
    const returns = out.suggestions.find((s) => s.kind === 'returns');
    expect(returns?.data).toMatchObject({ days: 7 });
    expect(returns?.evidence).toContain('7 ngày');
  });

  it('văn bản mơ hồ không số → không bịa giá trị', () => {
    const out = analyzePolicyTexts([
      { title: 'x', content: 'Shop luôn hỗ trợ khách hàng tận tình.' },
    ]);
    expect(out.suggestions).toEqual([]);
  });

  it('cắt ở trần độ dài (không ném lỗi)', () => {
    const long = 'Lorem ipsum dolor sit amet. '.repeat(Math.ceil((MAX_ANALYZE_CHARS * 2) / 28));
    expect(() => analyzePolicyTexts([{ title: 'x', content: long }])).not.toThrow();
  });
});
