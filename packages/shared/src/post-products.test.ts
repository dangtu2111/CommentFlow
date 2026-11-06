import { describe, expect, it } from 'vitest';
import {
  BULK_MAX_POSTS,
  BULK_MAX_PRODUCTS,
  confirmedProductIds,
  effectivePrimary,
  parseLinkPostProducts,
  summarizePostLinks,
} from './post-products';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const link = (
  n: number,
  o: Partial<{ status: 'confirmed' | 'suggested'; isPrimary: boolean }> = {},
) => ({
  productId: id(n),
  status: o.status ?? 'confirmed',
  isPrimary: o.isPrimary ?? false,
});

describe('FR-061 / US-032 parseLinkPostProducts', () => {
  it('nhận nhiều bài × nhiều sản phẩm, loại trùng, giữ thứ tự', () => {
    const r = parseLinkPostProducts({
      postIds: [id(1), id(2), id(1)],
      productIds: [id(10), id(11), id(10)],
      primaryProductId: id(11),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.postIds).toEqual([id(1), id(2)]);
    expect(r.data.productIds).toEqual([id(10), id(11)]);
    expect(r.data.primaryProductId).toBe(id(11));
  });

  it('không chọn sản phẩm chính → null', () => {
    const r = parseLinkPostProducts({ postIds: [id(1)], productIds: [id(10)] });
    expect(r.success && r.data.primaryProductId).toBeNull();
  });

  it('sản phẩm chính phải nằm trong danh sách gắn', () => {
    expect(
      parseLinkPostProducts({
        postIds: [id(1)],
        productIds: [id(10)],
        primaryProductId: id(99),
      }).success,
    ).toBe(false);
  });

  it('rỗng, sai uuid → lỗi', () => {
    expect(parseLinkPostProducts({ postIds: [], productIds: [id(10)] }).success).toBe(false);
    expect(parseLinkPostProducts({ postIds: [id(1)], productIds: [] }).success).toBe(false);
    expect(parseLinkPostProducts({ postIds: ['x'], productIds: [id(10)] }).success).toBe(false);
  });

  it('đúng biên số bài / sản phẩm', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i + 1));
    expect(
      parseLinkPostProducts({
        postIds: ids(BULK_MAX_POSTS),
        productIds: ids(BULK_MAX_PRODUCTS),
      }).success,
    ).toBe(true);
    expect(
      parseLinkPostProducts({ postIds: ids(BULK_MAX_POSTS + 1), productIds: [id(10)] }).success,
    ).toBe(false);
    expect(
      parseLinkPostProducts({ postIds: [id(1)], productIds: ids(BULK_MAX_PRODUCTS + 1) }).success,
    ).toBe(false);
  });
});

describe('FR-061 confirmedProductIds: đề xuất AI chưa xác nhận không được dùng để trả lời', () => {
  it('chỉ lấy liên kết đã xác nhận', () => {
    expect(confirmedProductIds([link(1), link(2, { status: 'suggested' }), link(3)])).toEqual([
      id(1),
      id(3),
    ]);
  });
  it('rỗng → rỗng', () => expect(confirmedProductIds([])).toEqual([]));
});

describe('FR-061 effectivePrimary', () => {
  it('lấy sản phẩm được đánh dấu chính', () => {
    expect(effectivePrimary([link(1), link(2, { isPrimary: true })])).toBe(id(2));
  });
  it('không đánh dấu nhưng chỉ có một liên kết đã xác nhận → chính là nó', () => {
    expect(effectivePrimary([link(1), link(2, { status: 'suggested' })])).toBe(id(1));
  });
  it('nhiều liên kết, không đánh dấu → null (không đoán)', () => {
    expect(effectivePrimary([link(1), link(2)])).toBeNull();
  });
  it('đề xuất chưa xác nhận không bao giờ là chính, dù cờ bật', () => {
    expect(effectivePrimary([link(1, { status: 'suggested', isPrimary: true })])).toBeNull();
  });
  it('không có liên kết → null', () => expect(effectivePrimary([])).toBeNull());
});

describe('FR-061 summarizePostLinks', () => {
  it('đếm đã gắn / đang chờ xác nhận / có chính', () => {
    expect(
      summarizePostLinks([link(1, { isPrimary: true }), link(2), link(3, { status: 'suggested' })]),
    ).toEqual({ confirmed: 2, pendingSuggestions: 1, primaryProductId: id(1), linked: true });
  });
  it('chỉ có đề xuất → chưa tính là đã gắn', () => {
    expect(summarizePostLinks([link(1, { status: 'suggested' })])).toEqual({
      confirmed: 0,
      pendingSuggestions: 1,
      primaryProductId: null,
      linked: false,
    });
  });
});
