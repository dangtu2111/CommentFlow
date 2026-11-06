import { describe, expect, it } from 'vitest';
import { signShopifyBody, verifyShopifyWebhook } from './webhook';

// Giá trị giả ngắn, dựng lúc chạy (gitleaks).
const secret = ['tt', 'test'].join('-');
const body = '{"id":1,"title":"Áo thun"}';

describe('FR-052 chữ ký webhook Shopify (X-Shopify-Hmac-Sha256)', () => {
  it('FR-052 chữ ký đúng (base64 HMAC-SHA256 thân thô) được chấp nhận — chuỗi và byte', () => {
    const header = signShopifyBody(body, secret);
    expect(header).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(verifyShopifyWebhook({ rawBody: body, hmacHeader: header, secret })).toBe(true);
    expect(
      verifyShopifyWebhook({ rawBody: new TextEncoder().encode(body), hmacHeader: header, secret }),
    ).toBe(true);
  });

  it('FR-052 thân bị sửa 1 byte → từ chối', () => {
    const header = signShopifyBody(body, secret);
    expect(verifyShopifyWebhook({ rawBody: `${body} `, hmacHeader: header, secret })).toBe(false);
  });

  it('FR-052 sai bí mật → từ chối', () => {
    const header = signShopifyBody(body, 'tt-other');
    expect(verifyShopifyWebhook({ rawBody: body, hmacHeader: header, secret })).toBe(false);
  });

  it.each([null, undefined, '', 'abc', 'x'.repeat(44), ' '])(
    'FR-052 header thiếu/sai dạng %j → từ chối',
    (hmacHeader) => {
      expect(verifyShopifyWebhook({ rawBody: body, hmacHeader, secret })).toBe(false);
    },
  );

  it('FR-052 bí mật rỗng → luôn từ chối (không ký bằng khóa rỗng)', () => {
    const header = signShopifyBody(body, '');
    expect(verifyShopifyWebhook({ rawBody: body, hmacHeader: header, secret: '' })).toBe(false);
  });

  it('FR-052 header hex thay vì base64 → từ chối', () => {
    expect(verifyShopifyWebhook({ rawBody: body, hmacHeader: 'a'.repeat(64), secret })).toBe(false);
  });
});
