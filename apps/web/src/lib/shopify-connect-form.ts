/**
 * Kiểm đầu vào biểu mẫu "Kết nối Shopify" (thuần, không đọc DB/phiên). Mọi giá trị từ form chỉ là DỮ LIỆU: workspace và
 * người dùng lấy từ phiên ở Server Action. Tên miền phải là đúng `<tên>.myshopify.com` (chặn SSRF — worker gọi thẳng tên
 * miền này), khớp CHECK `shopify_stores_domain_check` ở DB.
 */
const SHOP_NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
const CLIENT_ID = /^[A-Za-z0-9._-]{8,100}$/;
const SECRET_MIN = 10;
const SECRET_MAX = 200;

/**
 * Chuẩn hóa tên miền: chấp nhận `ten`, `ten.myshopify.com`, hoặc URL `https://ten.myshopify.com/...` (bỏ đường dẫn/truy
 * vấn). Chỉ giao thức `https`; không nhận thông tin đăng nhập (`user@`), cổng hay tên miền khác. Sai → `null`.
 */
export function parseShopifyDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('://')) {
    if (!value.startsWith('https://')) return null;
    value = value.slice('https://'.length);
  }
  const host = value.split(/[/?#]/, 1)[0] ?? '';
  if (!host || host.includes('@') || host.includes(':')) return null;
  if (SHOP_NAME.test(host)) return `${host}.myshopify.com`;
  return SHOP_DOMAIN.test(host) ? host : null;
}

/** Client ID của ứng dụng (khớp CHECK `shopify_stores_client_id_check`): 8–100 ký tự chữ/số/. _ -. Không bí mật. */
export function parseShopifyClientId(input: string): string | null {
  const value = input.trim();
  return CLIENT_ID.test(value) ? value : null;
}

/** Client secret: 10–200 ký tự, không khoảng trắng/xuống dòng. Không đoán tiền tố (Shopify có thể đổi). */
export function parseShopifyClientSecret(input: string): string | null {
  const value = input.trim();
  if (value.length < SECRET_MIN || value.length > SECRET_MAX) return null;
  return /\s/.test(value) ? null : value;
}
