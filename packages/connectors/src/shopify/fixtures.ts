/**
 * Fixture Shopify Admin GraphQL (FR-052) — dựng theo hình dạng trong tài liệu công khai
 * (https://shopify.dev/docs/api/admin-graphql), KHÔNG phải dữ liệu thật. Dùng ở test và mock.
 */
export const SHOP_DOMAIN = 'demo-shop.myshopify.com';
/** Giá trị giả ngắn (không giống khóa thật — gitleaks). */
export const FAKE_TOKEN = 'tt-test';

export const throttle = (available: number, cost = 12) => ({
  cost: {
    requestedQueryCost: cost,
    actualQueryCost: cost,
    throttleStatus: { maximumAvailable: 2000, currentlyAvailable: available, restoreRate: 100 },
  },
});

export const variantNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: `gid://shopify/ProductVariant/${n}`,
  sku: `SKU-${n}`,
  title: `Mau ${n}`,
  price: '150000.00',
  compareAtPrice: null,
  inventoryQuantity: n,
  inventoryItem: { tracked: true },
  selectedOptions: [{ name: 'Màu', value: `Mau ${n}` }],
  ...over,
});

export const productNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: `gid://shopify/Product/${n}`,
  title: `Áo thun ${n}`,
  handle: `ao-thun-${n}`,
  status: 'ACTIVE',
  productType: 'Áo',
  onlineStoreUrl: `https://demo-shop.myshopify.com/products/ao-thun-${n}`,
  variants: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [variantNode(n * 10 + 1), variantNode(n * 10 + 2, { compareAtPrice: '200000.00' })],
  },
  ...over,
});

export const productsPage = (
  nodes: unknown[],
  next: string | null,
  available = 1900,
  currencyCode = 'VND',
) => ({
  data: {
    shop: { currencyCode },
    products: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes },
  },
  extensions: throttle(available),
});

export const variantsPage = (nodes: unknown[], next: string | null) => ({
  data: {
    node: { variants: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes } },
  },
  extensions: throttle(1900),
});

export const policiesResponse = {
  data: {
    shop: {
      shopPolicies: [
        {
          type: 'REFUND_POLICY',
          title: 'Chính sách đổi trả',
          body: '<p>Đổi trả trong 7 ngày.</p>',
          url: 'https://demo-shop.myshopify.com/policies/refund-policy',
        },
        {
          type: 'SHIPPING_POLICY',
          title: 'Vận chuyển',
          body: '',
          url: 'https://demo-shop.myshopify.com/policies/shipping',
        },
      ],
    },
  },
  extensions: throttle(1900, 4),
};

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
