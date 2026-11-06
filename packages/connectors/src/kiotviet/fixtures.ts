/**
 * Fixture KiotViet Public API (FR-122) — dựng theo hình dạng trong tài liệu công khai
 * (https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/public-api/), KHÔNG phải dữ liệu thật. Dùng ở test và mock.
 */
/** Giá trị giả ngắn (không giống khóa thật — gitleaks). */
export const FAKE_TOKEN = 'tt-test';
export const FAKE_RETAILER = 'demo-shop';
export const FAKE_CLIENT_ID = 'cid-test';
export const FAKE_CLIENT_SECRET = 'cs-test';

export const inventoryNode = (onHand: number | null, branchId = 1) => ({
  productId: 0,
  branchId,
  branchName: `Chi nhanh ${branchId}`,
  onHand,
});

/** Sản phẩm đơn (không biến thể). */
export const productNode = (n: number, over: Record<string, unknown> = {}) => ({
  id: n,
  code: `SP${n}`,
  name: `Áo thun ${n}`,
  fullName: `Áo thun ${n}`,
  categoryName: 'Áo',
  allowsSale: true,
  hasVariants: false,
  isActive: true,
  basePrice: 150000,
  attributes: [],
  inventories: [inventoryNode(5)],
  ...over,
});

/** Sản phẩm cha có biến thể (không mang giá/tồn riêng). */
export const masterNode = (n: number, over: Record<string, unknown> = {}) =>
  productNode(n, { hasVariants: true, basePrice: 0, inventories: [], ...over });

/** Dòng biến thể: `masterProductId` trỏ về sản phẩm cha. */
export const variantNode = (n: number, masterId: number, over: Record<string, unknown> = {}) =>
  productNode(n, {
    name: `Áo thun ${masterId} - Mau ${n}`,
    fullName: `Áo thun ${masterId} - Mau ${n}`,
    masterProductId: masterId,
    attributes: [{ attributeName: 'Màu', attributeValue: `Mau ${n}` }],
    ...over,
  });

export const productsPage = (nodes: unknown[], total = nodes.length) => ({
  total,
  pageSize: 100,
  data: nodes,
});

export const tokenBody = (over: Record<string, unknown> = {}) => ({
  access_token: FAKE_TOKEN,
  expires_in: 86400,
  token_type: 'Bearer',
  ...over,
});

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
