import { describe, expect, it } from 'vitest';
import { maskPii, unsafeMarkMasked } from './pii';

describe('maskPii', () => {
  it('che email', () => {
    expect(maskPii('Liên hệ khach.hang+1@Gmail.com nhé')).toBe('Liên hệ [email] nhé');
  });

  it('che số điện thoại di động Việt Nam ở các dạng viết thường gặp', () => {
    for (const phone of [
      '0912345678',
      '0912 345 678',
      '091.234.5678',
      '091-234-5678',
      '+84 912 345 678',
      '+84912345678',
      '84912345678',
      '0332345678',
      '0869 123 456',
    ]) {
      expect(maskPii(`gọi ${phone} giúp em`), phone).toBe('gọi [sđt] giúp em');
    }
  });

  it('che nhiều thông tin trong cùng một câu', () => {
    expect(maskPii('SĐT 0912345678, mail a@b.co, hoặc 0987654321')).toBe(
      'SĐT [sđt], mail [email], hoặc [sđt]',
    );
  });

  it('không che giá tiền, số lượng, năm, mã đơn', () => {
    for (const text of [
      'Giá 1500000đ',
      'còn 12 cái',
      'năm 2026',
      'mã đơn 4567890123 hôm qua',
      '0.5kg',
      'size 38',
    ]) {
      expect(maskPii(text), text).toBe(text);
    }
  });

  it('không cắt nhầm một dãy số dài hơn số điện thoại', () => {
    expect(maskPii('mã 09123456789012')).toBe('mã 09123456789012');
  });

  it('chuỗi rỗng và chuỗi không có thông tin cá nhân giữ nguyên', () => {
    expect(maskPii('')).toBe('');
    expect(maskPii('Áo này còn size M không shop?')).toBe('Áo này còn size M không shop?');
  });

  it('chạy lại trên kết quả đã che không đổi (idempotent)', () => {
    const once = maskPii('0912345678 a@b.co');
    expect(maskPii(once)).toBe(once);
  });
});

describe('unsafeMarkMasked', () => {
  it('trả lại đúng chuỗi (chỉ đổi kiểu) — dành cho nội dung cố định không chứa dữ liệu khách', () => {
    expect(unsafeMarkMasked('Bạn là trợ lý của shop.')).toBe('Bạn là trợ lý của shop.');
  });
});
