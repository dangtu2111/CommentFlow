import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ShopifyCatalog, ShopifyProduct, ShopifyVariant } from './connector';
import { buildShopifyImportPlan, parseShopifyMoney } from './normalize';

const variant = (over: Partial<ShopifyVariant> = {}): ShopifyVariant => ({
  id: 'gid://shopify/ProductVariant/1',
  sku: 'SKU-1',
  title: 'Đen / M',
  price: '150000.00',
  compareAtPrice: null,
  inventoryQuantity: 3,
  tracked: true,
  selectedOptions: [
    { name: 'Màu', value: 'Đen' },
    { name: 'Size', value: 'M' },
  ],
  ...over,
});

const product = (over: Partial<ShopifyProduct> = {}): ShopifyProduct => ({
  id: 'gid://shopify/Product/1',
  title: 'Áo thun',
  handle: 'ao-thun',
  status: 'ACTIVE',
  productType: 'Áo',
  description: '',
  tags: [],
  metafields: [],
  onlineStoreUrl: 'https://demo-shop.myshopify.com/products/ao-thun',
  imageUrl: 'https://cdn.shopify.com/s/files/1/demo/ao-thun.jpg',
  variants: [variant()],
  ...over,
});

const catalog = (products: ShopifyProduct[], currencyCode = 'VND'): ShopifyCatalog => ({
  currencyCode,
  products,
});

describe('FR-052 parseShopifyMoney', () => {
  it.each([
    ['150000.00', 150000],
    ['150000', 150000],
    ['0.00', 0],
    ['99000.0', 99000],
  ])('FR-052 VND %s → %i', (raw, expected) => {
    expect(parseShopifyMoney(raw, 'VND')).toBe(expected);
  });

  it.each(['150000.50', '-5', 'abc', '', '1e6', '1,000', '9999999999999'])(
    'FR-052 VND không hợp lệ %j → null',
    (raw) => {
      expect(parseShopifyMoney(raw, 'VND')).toBeNull();
    },
  );

  it('FR-052 tiền tệ khác VND → null (không quy đổi); null/undefined → null', () => {
    expect(parseShopifyMoney('10.00', 'USD')).toBeNull();
    expect(parseShopifyMoney(null, 'VND')).toBeNull();
  });

  it('FR-052 property: số nguyên bất kỳ trong giới hạn luôn được giữ nguyên', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999_999 }), (n) => {
        expect(parseShopifyMoney(`${n}.00`, 'VND')).toBe(n);
        expect(parseShopifyMoney(`${n}`, 'VND')).toBe(n);
      }),
    );
  });
});

describe('FR-052 buildShopifyImportPlan', () => {
  it('FR-052 chuẩn hóa sản phẩm + biến thể; id = gid Shopify; thuộc tính chuẩn hóa', () => {
    const [plan] = buildShopifyImportPlan(catalog([product()]));
    expect(plan).toMatchObject({
      externalId: 'gid://shopify/Product/1',
      name: 'Áo thun',
      category: 'Áo',
      url: 'https://demo-shop.myshopify.com/products/ao-thun',
      priceVnd: 150000,
      compareAtVnd: null,
      stock: 3,
    });
    expect(plan?.variants[0]).toMatchObject({
      externalId: 'gid://shopify/ProductVariant/1',
      sku: 'SKU-1',
      attrs: { Màu: 'Đen', Size: 'M' },
      attrsNorm: { color: 'black', size: 'm' },
      priceVnd: 150000,
      stock: 3,
    });
    expect(plan?.variantsSnapshot[0]).toEqual({
      sku: 'SKU-1',
      attrs: { Màu: 'Đen', Size: 'M' },
      priceVnd: 150000,
      compareAtVnd: null,
      stock: 3,
    });
  });

  it('FR-052 giá sản phẩm = giá thấp nhất (kèm giá gốc của chính biến thể đó); tồn = tổng', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([
        product({
          variants: [
            variant({
              id: 'v1',
              price: '200000.00',
              compareAtPrice: '250000.00',
              inventoryQuantity: 2,
            }),
            variant({
              id: 'v2',
              price: '150000.00',
              compareAtPrice: '180000.00',
              inventoryQuantity: 5,
            }),
          ],
        }),
      ]),
    );
    expect(plan).toMatchObject({ priceVnd: 150000, compareAtVnd: 180000, stock: 7 });
  });

  it('FR-052 tồn chỉ khi tracked; có biến thể không theo dõi → tồn sản phẩm null', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([
        product({
          variants: [
            variant({ id: 'v1', tracked: false, inventoryQuantity: 99 }),
            variant({ id: 'v2', tracked: true, inventoryQuantity: 4 }),
          ],
        }),
      ]),
    );
    expect(plan?.variants[0]?.stock).toBeNull();
    expect(plan?.variants[1]?.stock).toBe(4);
    expect(plan?.stock).toBeNull();
  });

  it('FR-052 tồn âm hoặc thiếu → null', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([
        product({
          variants: [
            variant({ id: 'v1', inventoryQuantity: -2 }),
            variant({ id: 'v2', inventoryQuantity: null }),
          ],
        }),
      ]),
    );
    expect(plan?.variants.map((v) => v.stock)).toEqual([null, null]);
  });

  it('FR-052 tiền tệ khác VND → mọi giá null (AI không tự quy đổi)', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([product({ variants: [variant({ compareAtPrice: '20.00' })] })], 'USD'),
    );
    expect(plan).toMatchObject({ priceVnd: null, compareAtVnd: null });
    expect(plan?.variants[0]).toMatchObject({ priceVnd: null, compareAtVnd: null });
  });

  it('FR-052 bỏ tùy chọn mặc định "Default Title"; biến thể không thuộc tính', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([
        product({
          variants: [
            variant({ selectedOptions: [{ name: 'Title', value: 'Default Title' }], sku: null }),
          ],
        }),
      ]),
    );
    expect(plan?.variants[0]?.attrs).toEqual({});
    expect(plan?.variants[0]?.sku).toBeNull();
  });

  it('FR-052 chỉ nhận sản phẩm ACTIVE; url không phải http(s) → null; loại rỗng → null', () => {
    const plans = buildShopifyImportPlan(
      catalog([
        product({ id: 'p1', status: 'DRAFT' }),
        product({ id: 'p2', status: 'ARCHIVED' }),
        product({ id: 'p3', onlineStoreUrl: 'javascript:alert(1)', productType: '' }),
        product({ id: 'p4', onlineStoreUrl: null }),
        product({ id: 'p5', onlineStoreUrl: 'not a url' }),
      ]),
    );
    expect(plans.map((p) => p.externalId)).toEqual(['p3', 'p4', 'p5']);
    expect(plans[2]?.url).toBeNull();
    expect(plans[0]).toMatchObject({ url: null, category: null });
    expect(plans[1]?.url).toBeNull();
  });

  it('KB-PRODUCT-IMAGE ảnh chỉ nhận https; null/http/dạng lạ → không có ảnh', () => {
    const plans = buildShopifyImportPlan(
      catalog([
        product({ id: 'a' }),
        product({ id: 'b', imageUrl: null }),
        product({ id: 'c', imageUrl: 'http://cdn.example.com/x.jpg' }),
        product({ id: 'd', imageUrl: 'javascript:alert(1)' }),
        product({ id: 'e', imageUrl: 'data:image/png;base64,AAAA' }),
      ]),
    );
    expect(plans.map((p) => p.imageUrl)).toEqual([
      'https://cdn.shopify.com/s/files/1/demo/ao-thun.jpg',
      null,
      null,
      null,
      null,
    ]);
  });

  it('FR-052 search_text có tên/SKU/thuộc tính, KHÔNG có giá/tồn', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([product({ variants: [variant({ price: '777000.00', inventoryQuantity: 4242 })] })]),
    );
    expect(plan?.searchText).toContain('ao');
    expect(plan?.searchText).toContain('sku');
    expect(plan?.searchText).not.toContain('777000');
    expect(plan?.searchText).not.toContain('4242');
  });

  it('FR-052 sản phẩm không biến thể → giá/tồn null, vẫn nhập', () => {
    const [plan] = buildShopifyImportPlan(catalog([product({ variants: [] })]));
    expect(plan).toMatchObject({ priceVnd: null, stock: null });
    expect(plan?.variants).toEqual([]);
  });

  it('FR-052 property: chuẩn hóa không bao giờ ném lỗi và id sản phẩm được giữ', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.option(fc.integer(), { nil: null }),
        (title, price, qty) => {
          const plans = buildShopifyImportPlan(
            catalog([
              product({
                title,
                variants: [variant({ price, inventoryQuantity: qty })],
              }),
            ]),
          );
          expect(plans[0]?.externalId).toBe('gid://shopify/Product/1');
        },
      ),
    );
  });
});

describe('FR-058 buildShopifyImportPlan — thẻ sản phẩm', () => {
  it('mô tả/tag/loại/metafield → plan.card; không có gì → card rỗng', () => {
    const [withCard] = buildShopifyImportPlan(
      catalog([
        product({
          description: 'Áo cotton mềm. Giá chỉ 99k!',
          tags: ['hè'],
          metafields: [
            {
              namespace: 'custom',
              key: 'material',
              type: 'single_line_text_field',
              value: 'cotton',
            },
          ],
        }),
      ]),
    );
    expect(withCard?.card).toEqual({
      type: 'Áo',
      tags: ['hè'],
      description: 'Áo cotton mềm.',
      material: 'cotton',
    });
    const [bare] = buildShopifyImportPlan(catalog([product({ productType: '' })]));
    expect(bare?.card).toEqual({});
  });

  it('giá trong mô tả không bao giờ thành giá sản phẩm và không lọt vào thẻ', () => {
    const [plan] = buildShopifyImportPlan(
      catalog([product({ description: 'Chỉ 1.000đ hôm nay. Chất liệu cotton.' })], 'VND'),
    );
    expect(plan?.card?.description).toBe('Chất liệu cotton.');
    expect(plan?.priceVnd).toBe(150000);
  });
});
