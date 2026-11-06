import type { Database } from '@flow/db/runtime';
import { describe, expect, it, vi } from 'vitest';
import {
  createDbVariantLookup,
  lookupVariantsForRoute,
  type RouteVariant,
  type VariantLookup,
  wantedAttrs,
} from './sql-lookup';

/** Fixture biến thể (không phải dữ liệu thật). */
const VARIANT: RouteVariant = {
  id: 'v-1',
  productId: 'p-1',
  attrs: { size: 'M', color: 'black' },
  priceVnd: 199000,
  stock: 3,
};

describe('FR-136 wantedAttrs — thuộc tính khách hỏi, đã chuẩn hóa (FR-129)', () => {
  it('size/màu tiếng Việt → khóa/giá trị chuẩn', () => {
    expect(wantedAttrs({ size: ' M ', color: 'Đen' })).toEqual({ size: 'm', color: 'black' });
  });

  it('thiếu → bỏ khóa; không có gì → {}', () => {
    expect(wantedAttrs({ size: null, color: 'trắng' })).toEqual({ color: 'white' });
    expect(wantedAttrs({ size: null, color: null })).toEqual({});
  });
});

describe('FR-136 lookupVariantsForRoute', () => {
  it('chuẩn hóa trước khi tra và trả biến thể từ DB (giá/tồn không qua vector)', async () => {
    const lookup = vi.fn<VariantLookup>(async () => [VARIANT]);
    const result = await lookupVariantsForRoute(lookup, ['p-1'], { size: 'M', color: 'đen' });
    expect(lookup).toHaveBeenCalledWith(['p-1'], { size: 'm', color: 'black' });
    expect(result).toEqual({ wanted: { size: 'm', color: 'black' }, variants: [VARIANT] });
  });

  it('không sản phẩm → rỗng, không gọi DB', async () => {
    const lookup = vi.fn<VariantLookup>(async () => [VARIANT]);
    const result = await lookupVariantsForRoute(lookup, [], { size: 'M', color: null });
    expect(result.variants).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('không biến thể khớp → mảng rỗng (không đoán)', async () => {
    const lookup = vi.fn<VariantLookup>(async () => []);
    const result = await lookupVariantsForRoute(lookup, ['p-1'], { size: 'XXL', color: null });
    expect(result.variants).toEqual([]);
  });
});

describe('FR-136 createDbVariantLookup — bọc findActiveVariants', () => {
  it('chạy truy vấn theo workspace và đổi hàng DB → RouteVariant', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        { id: 'v-1', product_id: 'p-1', attrs: { size: 'M' }, price_vnd: '199000', stock: 3 },
        { id: 'v-2', product_id: 'p-1', attrs: { size: 'L' }, price_vnd: null, stock: null },
      ],
    }));
    const lookup = createDbVariantLookup({ execute } as unknown as Database, 'ws-1');
    const variants = await lookup(['p-1'], { size: 'm' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(variants).toEqual([
      { id: 'v-1', productId: 'p-1', attrs: { size: 'M' }, priceVnd: 199000, stock: 3 },
      { id: 'v-2', productId: 'p-1', attrs: { size: 'L' }, priceVnd: null, stock: null },
    ]);
  });
});
