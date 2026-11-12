import { describe, expect, it } from 'vitest';
import {
  catalogHref,
  catalogSourceKey,
  formatCatalogPrice,
  pageRange,
  parseCatalogParams,
  stockState,
} from './catalog-view';

describe('parseCatalogParams', () => {
  it('mặc định: không tìm kiếm, mọi nguồn, đang hoạt động, trang 1', () => {
    expect(parseCatalogParams({})).toEqual({
      q: '',
      source: undefined,
      status: 'active',
      page: 1,
    });
  });

  it('nhận từ khóa (cắt khoảng trắng, tối đa 100 ký tự), nguồn hợp lệ, ngừng bán, số trang', () => {
    const r = parseCatalogParams({
      q: `  ${'a'.repeat(150)} `,
      source: 'shopify',
      status: 'archived',
      page: '3',
    });
    expect(r.q).toHaveLength(100);
    expect(r).toMatchObject({ source: 'shopify', status: 'archived', page: 3 });
  });

  it('giá trị lạ/độc hại → rơi về mặc định (không đưa vào truy vấn)', () => {
    expect(
      parseCatalogParams({ source: "x'; DROP TABLE", status: 'deleted', page: '-4' }),
    ).toMatchObject({ source: undefined, status: 'active', page: 1 });
    expect(parseCatalogParams({ page: 'abc' }).page).toBe(1);
    expect(parseCatalogParams({ page: '1e9' }).page).toBe(1);
    expect(parseCatalogParams({ page: '99999999' }).page).toBe(1000);
    expect(parseCatalogParams({ q: ['a', 'b'] }).q).toBe('a');
  });
});

describe('formatCatalogPrice', () => {
  const base = {
    priceVnd: null,
    compareAtVnd: null,
    currencyCode: 'VND',
    priceMinor: null,
    compareAtMinor: null,
  };

  it('VND: giá theo đồng, kèm giá gạch (so sánh) khi cao hơn', () => {
    expect(formatCatalogPrice({ ...base, priceVnd: 299000, compareAtVnd: 350000 })).toEqual({
      price: '299.000đ',
      compareAt: '350.000đ',
    });
    expect(formatCatalogPrice({ ...base, priceVnd: 199000, compareAtVnd: 199000 })).toEqual({
      price: '199.000đ',
      compareAt: null,
    });
  });

  it('tiền tệ khác VND: giá theo đơn vị nhỏ nhất của tiền tệ gốc, KHÔNG quy đổi', () => {
    expect(
      formatCatalogPrice({ ...base, currencyCode: 'USD', priceMinor: 1299, compareAtMinor: null }),
    ).toEqual({ price: '$12.99', compareAt: null });
    expect(formatCatalogPrice({ ...base, currencyCode: 'JPY', priceMinor: 1500 })?.price).toBe(
      '¥1,500',
    );
  });

  it('chưa có giá → null; mã tiền tệ hỏng không làm sập', () => {
    expect(formatCatalogPrice(base)).toBeNull();
    expect(formatCatalogPrice({ ...base, currencyCode: 'ab!', priceMinor: 5 })).toBeNull();
  });
});

describe('stockState', () => {
  it('chưa có số / hết / sắp hết (< 10) / còn', () => {
    expect(stockState(null)).toBe('unknown');
    expect(stockState(0)).toBe('out');
    expect(stockState(-2)).toBe('out');
    expect(stockState(9)).toBe('low');
    expect(stockState(10)).toBe('in');
  });
});

describe('pageRange / catalogHref', () => {
  it('khoảng đang hiện và tổng số trang', () => {
    expect(pageRange(1, 20, 45)).toEqual({ from: 1, to: 20, pages: 3 });
    expect(pageRange(3, 20, 45)).toEqual({ from: 41, to: 45, pages: 3 });
    expect(pageRange(1, 20, 0)).toEqual({ from: 0, to: 0, pages: 1 });
  });

  it('liên kết giữ bộ lọc, bỏ giá trị mặc định', () => {
    expect(catalogHref({ q: '', source: undefined, status: 'active', page: 1 })).toBe(
      '/app/kb/catalog',
    );
    expect(catalogHref({ q: 'áo', source: 'excel', status: 'archived', page: 2 })).toBe(
      '/app/kb/catalog?q=%C3%A1o&source=excel&status=archived&page=2',
    );
  });
});

describe('catalogSourceKey', () => {
  it('ba nguồn có tab giữ nguyên, nguồn khác gộp other', () => {
    expect(catalogSourceKey('shopify')).toBe('shopify');
    expect(catalogSourceKey('excel')).toBe('excel');
    expect(catalogSourceKey('haravan')).toBe('other');
  });
});
