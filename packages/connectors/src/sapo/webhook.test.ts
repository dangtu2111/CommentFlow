import { describe, expect, it } from 'vitest';
import { signSapoBody, verifySapoWebhook } from './webhook';

const SECRET = 'ss-test';
const BODY = '{"id":1,"title":"Áo"}';

describe('FR-122 verifySapoWebhook', () => {
  it('chữ ký đúng → true (chuỗi và byte)', () => {
    const hmacHeader = signSapoBody(BODY, SECRET);
    expect(verifySapoWebhook({ rawBody: BODY, hmacHeader, secret: SECRET })).toBe(true);
    expect(
      verifySapoWebhook({ rawBody: new TextEncoder().encode(BODY), hmacHeader, secret: SECRET }),
    ).toBe(true);
  });
  it('chữ ký cùng độ dài nhưng bị sửa một ký tự → false', () => {
    const good = signSapoBody(BODY, SECRET);
    const tampered = `${good[0] === 'A' ? 'B' : 'A'}${good.slice(1)}`;
    expect(verifySapoWebhook({ rawBody: BODY, hmacHeader: tampered, secret: SECRET })).toBe(false);
  });
  it('sai thân / sai bí mật / thiếu / sai dạng / bí mật rỗng → false', () => {
    const hmacHeader = signSapoBody(BODY, SECRET);
    expect(verifySapoWebhook({ rawBody: `${BODY} `, hmacHeader, secret: SECRET })).toBe(false);
    expect(verifySapoWebhook({ rawBody: BODY, hmacHeader, secret: 'other' })).toBe(false);
    expect(verifySapoWebhook({ rawBody: BODY, hmacHeader: null, secret: SECRET })).toBe(false);
    expect(verifySapoWebhook({ rawBody: BODY, hmacHeader: 'zzz', secret: SECRET })).toBe(false);
    expect(verifySapoWebhook({ rawBody: BODY, hmacHeader, secret: '' })).toBe(false);
  });
});
