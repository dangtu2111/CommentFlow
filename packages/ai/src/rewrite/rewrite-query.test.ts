import { unsafeMarkMasked as m } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { buildRuleQuery, MAX_QUERY_CHARS, needsLlmRewrite } from './rewrite-query';

describe('FR-137 buildRuleQuery', () => {
  it('ghép bình luận + cha + caption + tên sản phẩm', () => {
    const q = buildRuleQuery({
      comment: m('còn size M không'),
      parentComment: m('áo này giá sao'),
      postCaption: m('Áo thun cotton mới về'),
      productName: m('Áo thun cotton'),
    });
    expect(q).toBe('còn size M không | áo này giá sao | Áo thun cotton mới về | Áo thun cotton');
  });

  it('chỉ có bình luận → trả đúng bình luận (đã chuẩn hóa khoảng trắng)', () => {
    expect(buildRuleQuery({ comment: m('  giá   bao nhiêu ') })).toBe('giá bao nhiêu');
  });

  it('bỏ phần rỗng và phần trùng (không phân biệt hoa thường)', () => {
    const q = buildRuleQuery({
      comment: m('Áo thun'),
      parentComment: m('   '),
      productName: m('áo THUN'),
    });
    expect(q).toBe('Áo thun');
  });

  it('caption bị rút gọn ở 200 ký tự', () => {
    const q = buildRuleQuery({ comment: m('giá'), postCaption: m('a'.repeat(500)) });
    expect(q).toBe(`giá | ${'a'.repeat(200)}`);
  });

  it('kết quả không vượt MAX_QUERY_CHARS', () => {
    const q = buildRuleQuery({
      comment: m('b'.repeat(300)),
      parentComment: m('c'.repeat(300)),
      postCaption: m('d'.repeat(300)),
    });
    expect(q.length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    expect(q.startsWith('b'.repeat(300))).toBe(true);
  });
});

describe('FR-137 needsLlmRewrite', () => {
  it('câu ≤ 6 từ + chưa có sản phẩm → cần', () => {
    expect(needsLlmRewrite({ comment: m('một hai ba bốn năm sáu'), productKnown: false })).toBe(
      true,
    );
  });
  it('7 từ rõ nghĩa → không cần (ca biên)', () => {
    expect(needsLlmRewrite({ comment: m('một hai ba bốn năm sáu bảy'), productKnown: false })).toBe(
      false,
    );
  });
  it('câu dài nhưng có cụm chỉ định mơ hồ → cần', () => {
    expect(
      needsLlmRewrite({
        comment: m('mẫu đó còn hàng màu trắng size M không shop ơi'),
        productKnown: false,
      }),
    ).toBe(true);
    expect(
      needsLlmRewrite({
        comment: m('cho mình hỏi áo thun cotton màu trắng này còn hàng không'),
        productKnown: false,
      }),
    ).toBe(true);
  });
  it('đã nhận được sản phẩm → không cần dù câu ngắn', () => {
    expect(needsLlmRewrite({ comment: m('giá?'), productKnown: true })).toBe(false);
  });
  it('câu rỗng → không cần (không có gì để viết lại)', () => {
    expect(needsLlmRewrite({ comment: m('   '), productKnown: false })).toBe(false);
  });
  it('Unicode: không phụ thuộc dạng NFC/NFD', () => {
    expect(needsLlmRewrite({ comment: m('giá'.normalize('NFD')), productKnown: false })).toBe(true);
    expect(
      needsLlmRewrite({
        comment: m('mẫu đó còn hàng không'.normalize('NFD')),
        productKnown: false,
      }),
    ).toBe(true);
  });
});
