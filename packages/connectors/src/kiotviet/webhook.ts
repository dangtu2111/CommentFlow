import { createHmac, timingSafeEqual } from 'node:crypto';

/** `sha256=` + 64 ký tự hex. */
const SIGNATURE = /^sha256=[0-9a-fA-F]{64}$/;

/** Giá trị header `X-Hub-Signature` cho một thân thô (dùng ở test/mock). */
export function signKiotVietBody(rawBody: string | Uint8Array, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/**
 * Xác minh webhook KiotViet (FR-122, docs/12 §4): `X-Hub-Signature: sha256=<hex>` = HMAC-SHA256(thân THÔ, bí mật
 * webhook). Phải dùng đúng thân thô trước khi parse JSON. So sánh thời gian hằng; thiếu/sai dạng/bí mật rỗng → `false`.
 * Chưa có route nhận webhook (cần kết nối cửa hàng — gap KIOTVIET-CONNECT-STORE); định dạng header đối chiếu tài liệu
 * chính thức khi có shop thật.
 */
export function verifyKiotVietWebhook(input: {
  rawBody: string | Uint8Array;
  signatureHeader: string | null | undefined;
  secret: string;
}): boolean {
  const { rawBody, signatureHeader, secret } = input;
  if (secret === '' || !signatureHeader || !SIGNATURE.test(signatureHeader)) return false;
  const expected = Buffer.from(signKiotVietBody(rawBody, secret).slice(7), 'hex');
  const given = Buffer.from(signatureHeader.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
