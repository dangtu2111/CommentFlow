import { createHmac, timingSafeEqual } from 'node:crypto';

/** Chữ ký base64 của SHA-256 là 44 ký tự (32 byte). */
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

/** Giá trị header `X-Sapo-Hmac-Sha256` cho một thân thô (dùng ở test/mock). */
export function signSapoBody(rawBody: string | Uint8Array, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

/**
 * Xác minh webhook Sapo (FR-122, docs/12 §4): `X-Sapo-Hmac-Sha256` = base64(HMAC-SHA256(thân THÔ, bí mật ứng dụng)).
 * Phải dùng đúng thân thô trước khi parse JSON. So sánh thời gian hằng; thiếu/sai dạng/bí mật rỗng → `false`.
 * Chưa có route nhận webhook (cần kết nối cửa hàng — gap SAPO-CONNECT-STORE).
 */
export function verifySapoWebhook(input: {
  rawBody: string | Uint8Array;
  hmacHeader: string | null | undefined;
  secret: string;
}): boolean {
  const { rawBody, hmacHeader, secret } = input;
  if (secret === '' || !hmacHeader || !BASE64_SHA256.test(hmacHeader)) return false;
  const expected = Buffer.from(signSapoBody(rawBody, secret), 'base64');
  const given = Buffer.from(hmacHeader, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
