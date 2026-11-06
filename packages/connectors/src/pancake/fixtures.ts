/**
 * Fixture Pancake POS Open API (FR-122) — dựng theo hình dạng trong tài liệu công khai (https://docs.pancake.vn/,
 * `GET /shops/{SHOP_ID}/products`), KHÔNG phải dữ liệu thật. Dùng ở test và mock.
 */
/** Giá trị giả ngắn (không giống khóa thật — gitleaks). */
export const FAKE_API_KEY = 'ak-test';
export const FAKE_SHOP_ID = '12345';

export const variationNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: `var-${n}`,
  custom_id: `SKU${n}`,
  retail_price: 150000,
  remain_quantity: 5,
  is_hidden: false,
  fields: [],
  ...over,
});

/** Sản phẩm Pancake: luôn có mảng `variations` (sản phẩm đơn = một biến thể). */
export const productNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: `prod-${n}`,
  name: `Áo thun ${n}`,
  is_hidden: false,
  categories: [{ id: 1, name: 'Áo' }],
  variations: [variationNode(n)],
  ...over,
});

export const productsPage = (
  nodes: unknown[],
  over: { page?: number; totalPages?: number; totalEntries?: number } = {},
) => ({
  success: true,
  data: nodes,
  page_number: over.page ?? 1,
  total_pages: over.totalPages ?? 1,
  total_entries: over.totalEntries ?? nodes.length,
});

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
