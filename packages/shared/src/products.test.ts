import { describe, expect, it } from 'vitest';
import {
  CARD_VALUE_MAX,
  normalizeAttrs,
  type ProductEmbeddingInput,
  parseProductCard,
  productEmbeddingText,
} from './products';

describe('FR-129 normalizeAttrs (chuẩn hóa thuộc tính biến thể)', () => {
  it('đổi khóa Việt→Anh và giá trị màu về dạng chuẩn', () => {
    expect(normalizeAttrs({ mau: 'Đen', size: 'M' })).toEqual({ color: 'black', size: 'm' });
    expect(normalizeAttrs({ 'màu sắc': 'trắng', 'kích cỡ': 'XL' })).toEqual({
      color: 'white',
      size: 'xl',
    });
  });
  it('khóa/giá trị lạ được bỏ dấu + thường, không mất', () => {
    expect(normalizeAttrs({ 'Chất Liệu': 'Cotton Thoáng' })).toEqual({
      'chat lieu': 'cotton thoang',
    });
  });
  it('lũy đẳng và bỏ giá trị rỗng', () => {
    const once = normalizeAttrs({ Màu: 'den', Size: ' s ', Ghi: '  ' });
    expect(once).toEqual({ color: 'black', size: 's' });
    expect(normalizeAttrs(once)).toEqual(once);
  });
  it('rỗng → rỗng', () => {
    expect(normalizeAttrs({})).toEqual({});
  });
});

describe('FR-058 parseProductCard (thẻ sản phẩm)', () => {
  it('thẻ rỗng hợp lệ; đủ trường hợp lệ', () => {
    expect(parseProductCard({})).toEqual({ ok: true, card: {} });
    const full = {
      material: 'cotton',
      care: 'giặt tay',
      sizeChart: 'S 40-50kg',
      warranty: '7 ngày',
      origin: 'Việt Nam',
      type: 'áo',
      tags: ['hè', 'nữ'],
    };
    expect(parseProductCard(full)).toEqual({ ok: true, card: full });
  });
  it('đúng 600 ký tự qua, 601 bị từ chối', () => {
    expect(parseProductCard({ material: 'a'.repeat(CARD_VALUE_MAX) }).ok).toBe(true);
    expect(parseProductCard({ material: 'a'.repeat(CARD_VALUE_MAX + 1) }).ok).toBe(false);
    expect(parseProductCard({ tags: ['a'.repeat(CARD_VALUE_MAX + 1)] }).ok).toBe(false);
  });
  it('khóa lạ và kiểu sai bị từ chối', () => {
    expect(parseProductCard({ price: '100' }).ok).toBe(false);
    expect(parseProductCard({ material: 5 }).ok).toBe(false);
    expect(parseProductCard('x').ok).toBe(false);
  });
});

describe('FR-056 productEmbeddingText (giá/tồn không vào vector)', () => {
  const product: ProductEmbeddingInput = {
    name: 'Áo thun basic',
    category: 'Áo',
    card: { material: 'cotton', tags: ['hè'] },
    variants: [{ attrs: { size: 'M', color: 'đen' } }, { attrs: { size: 'L' } }],
  };
  it('có tên, danh mục, thẻ, thuộc tính biến thể', () => {
    const text = productEmbeddingText(product);
    for (const part of ['Áo thun basic', 'Áo', 'cotton', 'hè', 'size M', 'color đen', 'size L']) {
      expect(text).toContain(part);
    }
  });
  it('không bao giờ chứa giá/tồn dù lọt vào đầu vào', () => {
    const dirty = {
      ...product,
      price_vnd: 199000,
      stock: 42,
      variants: [{ attrs: { size: 'M' }, price_vnd: 199000, stock: 42 }],
    };
    expect(productEmbeddingText(dirty)).not.toMatch(/199|42/);
  });
  it('thiếu danh mục/thẻ/biến thể vẫn chạy', () => {
    expect(productEmbeddingText({ name: 'Mũ' })).toBe('Mũ');
  });
});
