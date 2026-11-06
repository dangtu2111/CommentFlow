/** Phiên bản Admin API ghim mặc định (docs/12 §4.1); đổi bằng `SHOPIFY_API_VERSION`. Kiểm lại trên tài liệu Shopify. */
export const DEFAULT_SHOPIFY_API_VERSION = '2026-07';

const API_VERSION = /^\d{4}-(01|04|07|10)$/;

export const isShopifyApiVersion = (value: string): boolean => API_VERSION.test(value);

export type ShopifyConfig = { enabled: boolean; apiVersion: string };

/**
 * Cờ và phiên bản Shopify từ biến môi trường do NƠI DỰNG truyền vào (FR-052, Q-SHI1). Mặc định TẮT: chỉ đúng chữ
 * `true` mới bật. Chỉ kiểm phiên bản khi bật. Hàm thuần, không đọc `process.env`.
 */
export function readShopifyConfig(env: Record<string, string | undefined>): ShopifyConfig {
  const enabled = env.SHOPIFY_ENABLED === 'true';
  const raw = env.SHOPIFY_API_VERSION;
  const apiVersion = raw === undefined || raw === '' ? DEFAULT_SHOPIFY_API_VERSION : raw;
  if (enabled && !isShopifyApiVersion(apiVersion)) {
    throw new Error('SHOPIFY_API_VERSION phải có dạng YYYY-MM (01/04/07/10).');
  }
  return { enabled, apiVersion };
}
