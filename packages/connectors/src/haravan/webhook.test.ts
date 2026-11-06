import { describe, expect, it } from 'vitest';
import { signHaravanBody, verifyHaravanWebhook } from './webhook';

const SECRET = 'ss-test';
const BODY = '{"id":1,"title":"Áo"}';

describe('verifyHaravanWebhook', () => {
  it('chữ ký đúng → true (chuỗi và byte)', () => {
    const hmacHeader = signHaravanBody(BODY, SECRET);
    expect(verifyHaravanWebhook({ rawBody: BODY, hmacHeader, secret: SECRET })).toBe(true);
    expect(
      verifyHaravanWebhook({ rawBody: new TextEncoder().encode(BODY), hmacHeader, secret: SECRET }),
    ).toBe(true);
  });
  it('sai thân / sai bí mật / thiếu / sai dạng / bí mật rỗng → false', () => {
    const hmacHeader = signHaravanBody(BODY, SECRET);
    expect(verifyHaravanWebhook({ rawBody: `${BODY} `, hmacHeader, secret: SECRET })).toBe(false);
    expect(verifyHaravanWebhook({ rawBody: BODY, hmacHeader, secret: 'other' })).toBe(false);
    expect(verifyHaravanWebhook({ rawBody: BODY, hmacHeader: null, secret: SECRET })).toBe(false);
    expect(verifyHaravanWebhook({ rawBody: BODY, hmacHeader: 'zzz', secret: SECRET })).toBe(false);
    expect(verifyHaravanWebhook({ rawBody: BODY, hmacHeader, secret: '' })).toBe(false);
  });
});
