import { describe, expect, it } from 'vitest';
import { shouldRerank } from './rerank-policy';

describe('shouldRerank — rerank chỉ khi reranker đáng tin', () => {
  it('tiếng Anh → có; tiếng Việt CÓ dấu (kể cả câu trộn Việt–Anh) → có', () => {
    expect(shouldRerank('how long does shipping take', 'en')).toBe(true);
    expect(shouldRerank('Phí ship tỉnh bao nhiêu vậy ạ', 'vi')).toBe(true);
    expect(shouldRerank('Order hôm nay thì bao lâu nhận được hàng?', 'vi')).toBe(true);
  });

  it('tiếng Việt KHÔNG dấu/teencode → không (đo: rerank làm MRR vi_plain 0,85 → 0,60, điểm đoạn đúng thấp hơn đoạn sai)', () => {
    expect(shouldRerank('dat hom nay may ngay nhan duoc hang shop', 'vi')).toBe(false);
    expect(shouldRerank('ship tinh bn tien v a', 'vi')).toBe(false);
  });

  it('chữ đ riêng cũng được tính là dấu tiếng Việt', () => {
    expect(shouldRerank('đổi size được không', 'vi')).toBe(true);
  });

  it('câu không dấu đã mở rộng viết tắt (lẫn vài từ có dấu) vẫn KHÔNG rerank; câu có dấu nhiều từ ngắn không dấu vẫn rerank', () => {
    expect(shouldRerank('ship tinh bao nhiêu tien vậy a', 'vi')).toBe(false);
    expect(shouldRerank('Cho xin giá cái này với', 'vi')).toBe(true);
    expect(shouldRerank('', 'vi')).toBe(false);
  });
});
