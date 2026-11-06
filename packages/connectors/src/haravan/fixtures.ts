/**
 * Fixture Haravan Omni API (FR-122) — dựng theo hình dạng trong tài liệu công khai (https://docs.haravan.com),
 * KHÔNG phải dữ liệu thật. Dùng ở test và mock.
 */
/** Giá trị giả ngắn (không giống khóa thật — gitleaks). */
export const FAKE_TOKEN = 'tt-test';

export const variantNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: n,
  sku: `SKU-${n}`,
  title: `Mau ${n}`,
  price: 150000,
  compare_at_price: 0,
  inventory_management: 'haravan',
  inventory_quantity: n,
  option1: `Mau ${n}`,
  option2: null,
  option3: null,
  ...over,
});

export const productNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: n,
  title: `Áo thun ${n}`,
  handle: `ao-thun-${n}`,
  product_type: 'Áo',
  published_at: '2026-01-01T00:00:00Z',
  options: [{ name: 'Màu', position: 1 }],
  variants: [variantNode(n * 10 + 1), variantNode(n * 10 + 2, { compare_at_price: 200000 })],
  ...over,
});

export const productsPage = (nodes: unknown[]) => ({ products: nodes });

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
