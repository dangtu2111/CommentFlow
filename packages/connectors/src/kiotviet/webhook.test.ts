import { describe, expect, it } from 'vitest';
import { signKiotVietBody, verifyKiotVietWebhook } from './webhook';

const SECRET = 'ws-test';
const BODY = '{"Notifications":[{"Action":"product.update"}]}';

describe('FR-122 verifyKiotVietWebhook', () => {
  const good = signKiotVietBody(BODY, SECRET);

  it('chữ ký đúng → true (chuỗi và byte)', () => {
    expect(good).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyKiotVietWebhook({ rawBody: BODY, signatureHeader: good, secret: SECRET })).toBe(
      true,
    );
    expect(
      verifyKiotVietWebhook({
        rawBody: new TextEncoder().encode(BODY),
        signatureHeader: good.toUpperCase().replace('SHA256=', 'sha256='),
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('thân bị sửa / bí mật khác → false', () => {
    expect(
      verifyKiotVietWebhook({ rawBody: `${BODY} `, signatureHeader: good, secret: SECRET }),
    ).toBe(false);
    expect(verifyKiotVietWebhook({ rawBody: BODY, signatureHeader: good, secret: 'other' })).toBe(
      false,
    );
  });

  it.each([null, undefined, '', 'sha256=abc', `md5=${'a'.repeat(64)}`, 'a'.repeat(64)])(
    'header thiếu/sai dạng (%s) → false',
    (signatureHeader) => {
      expect(verifyKiotVietWebhook({ rawBody: BODY, signatureHeader, secret: SECRET })).toBe(false);
    },
  );

  it('bí mật rỗng → false', () => {
    const header = signKiotVietBody(BODY, '');
    expect(verifyKiotVietWebhook({ rawBody: BODY, signatureHeader: header, secret: '' })).toBe(
      false,
    );
  });
});
