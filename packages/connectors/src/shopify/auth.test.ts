import { describe, expect, it, vi } from 'vitest';
import { isPlatformError } from '../errors';
import { exchangeShopifyClientCredentials } from './auth';

const SHOP = 'demo-shop.myshopify.com';
const CLIENT_ID = 'abcdef0123456789abcdef0123456789';
const SECRET = 'shpss_unit_test_secret_value';

const ok = (
  body: unknown = { access_token: 'tok_abc', scope: 'read_products', expires_in: 86399 },
) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function harness(respond: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as unknown as typeof fetch;
  const run = () =>
    exchangeShopifyClientCredentials({
      shopDomain: SHOP,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      fetch: fetchImpl,
    });
  return { run, calls };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isPlatformError(error)) return error;
    throw error;
  }
  throw new Error('mong đợi lỗi');
}

describe('exchangeShopifyClientCredentials', () => {
  it('thành công → token, phạm vi, thời hạn', async () => {
    const { run } = harness(() => ok());
    expect(await run()).toEqual({
      accessToken: 'tok_abc',
      scope: 'read_products',
      expiresInSeconds: 86399,
    });
  });

  it('gọi đúng điểm cuối, POST dạng form, không theo chuyển hướng; bí mật chỉ nằm trong thân', async () => {
    const { run, calls } = harness(() => ok());
    await run();
    const [call] = calls as [(typeof calls)[number]];
    expect(call.url).toBe(`https://${SHOP}/admin/oauth/access_token`);
    expect(call.init.method).toBe('POST');
    expect(call.init.redirect).toBe('error');
    expect((call.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = new URLSearchParams(String(call.init.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe(CLIENT_ID);
    expect(body.get('client_secret')).toBe(SECRET);
    expect(call.url).not.toContain(SECRET);
  });

  it('scope thiếu → chuỗi rỗng', async () => {
    const { run } = harness(() => ok({ access_token: 'tok', expires_in: 100 }));
    expect((await run()).scope).toBe('');
  });

  it.each([
    ['evil.com'],
    ['demo-shop.myshopify.com.evil.com'],
    ['http://demo-shop.myshopify.com'],
    ['-x.myshopify.com'],
  ])('tên miền %j không hợp lệ → ném lỗi, KHÔNG gọi mạng', async (shopDomain) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      exchangeShopifyClientCredentials({
        shopDomain,
        clientId: CLIENT_ID,
        clientSecret: SECRET,
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(/myshopify\.com/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'TOKEN_EXPIRED'],
    [401, 'TOKEN_EXPIRED'],
    [403, 'PERMISSION'],
    [404, 'UNKNOWN'],
    [500, 'UNKNOWN'],
  ] as const)('HTTP %i → %s', async (status, code) => {
    const { run } = harness(() => new Response('{"error":"x"}', { status }));
    expect((await failureOf(run())).code).toBe(code);
  });

  it('400/403 kèm mã lỗi của Shopify → mã đó nằm trong thông điệp (để biết vì sao); thân lạ/mã lạ → không kèm', async () => {
    const invalid = harness(() => new Response('{"error":"invalid_client"}', { status: 400 }));
    expect((await failureOf(invalid.run())).message).toBe(
      'shopify_invalid_credentials:invalid_client',
    );
    const forbidden = harness(
      () => new Response('{"error":"shop_not_permitted"}', { status: 403 }),
    );
    expect((await failureOf(forbidden.run())).message).toBe(
      'shopify_not_permitted:shop_not_permitted',
    );
    const weird = harness(
      () => new Response('{"error":"có dấu <script> và khoảng trắng"}', { status: 400 }),
    );
    expect((await failureOf(weird.run())).message).toBe('shopify_invalid_credentials');
    const notJson = harness(() => new Response('<html>', { status: 403 }));
    expect((await failureOf(notJson.run())).message).toBe('shopify_not_permitted');
    const notString = harness(() => new Response('{"error":42}', { status: 401 }));
    expect((await failureOf(notString.run())).message).toBe('shopify_invalid_credentials');
  });

  it('429 → RATE_LIMIT kèm Retry-After (có chặn trần)', async () => {
    const { run } = harness(
      () => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }),
    );
    const error = await failureOf(run());
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.retryAfterSeconds).toBe(7);
    const huge = harness(
      () => new Response('{}', { status: 429, headers: { 'retry-after': '99999' } }),
    );
    expect((await failureOf(huge.run())).retryAfterSeconds).toBeLessThanOrEqual(300);
    const missing = harness(() => new Response('{}', { status: 429 }));
    expect((await failureOf(missing.run())).retryAfterSeconds).toBeUndefined();
  });

  it('lỗi mạng / hết giờ → UNKNOWN; thông điệp lỗi không chứa bí mật', async () => {
    const { run } = harness(() => {
      throw new Error(`socket hang up ${SECRET}`);
    });
    const error = await failureOf(run());
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });

  it.each([
    ['không phải JSON', () => new Response('<html>', { status: 200 })],
    ['thiếu access_token', () => ok({ scope: 'x', expires_in: 1 })],
    ['access_token rỗng', () => ok({ access_token: '', expires_in: 1 })],
    ['expires_in không phải số', () => ok({ access_token: 't', expires_in: 'lâu' })],
    ['thân quá lớn', () => new Response('x'.repeat(20_000), { status: 200 })],
  ] as const)('phản hồi 200 %s → UNKNOWN', async (_name, respond) => {
    const { run } = harness(respond);
    expect((await failureOf(run())).code).toBe('UNKNOWN');
  });

  it('thân rỗng (không có body) → UNKNOWN', async () => {
    const { run } = harness(() => new Response(null, { status: 200 }));
    expect((await failureOf(run())).code).toBe('UNKNOWN');
  });
});
