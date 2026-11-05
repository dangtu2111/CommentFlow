import { describe, expect, it, vi } from 'vitest';
import { isPlatformError } from '../errors';
import { createFacebookOAuthClient } from './oauth';
import {
  accessTokenResponse,
  accountsPageWithNext,
  accountsResponse,
  FIXTURE_APP_ID,
  FIXTURE_APP_SECRET,
  FIXTURE_LONG_TOKEN,
  FIXTURE_REDIRECT_URI,
  FIXTURE_SHORT_TOKEN,
  graphError,
  meResponse,
  PAGE_A,
  PAGE_B,
} from './oauth.fixtures';

type Call = { url: URL; method: string };

function mockFetch(handler: (url: URL) => { status?: number; body: unknown } | Error) {
  const calls: Call[] = [];
  const fn = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? 'GET' });
    const out = handler(url);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fn, calls };
}

const client = (fetchFn: typeof fetch, extra: object = {}) =>
  createFacebookOAuthClient({
    appId: FIXTURE_APP_ID,
    appSecret: FIXTURE_APP_SECRET,
    redirectUri: FIXTURE_REDIRECT_URI,
    fetch: fetchFn,
    ...extra,
  });

describe('cấu hình client', () => {
  const f = mockFetch(() => ({ body: {} })).fn;
  it('timeoutMs ngoài (0, tối đa] bị từ chối', () => {
    expect(() => client(f, { timeoutMs: 0 })).toThrow(/timeoutMs/);
    expect(() => client(f, { timeoutMs: 10 ** 9 })).toThrow(/timeoutMs/);
  });
  it('redirectUri không phải URL bị từ chối', () => {
    expect(() => client(f, { redirectUri: 'không-phải-url' })).toThrow(/redirectUri/);
  });
  it('thiếu appSecret, redirectUri có fragment, state rỗng bị từ chối', () => {
    expect(() => client(f, { appSecret: '' })).toThrow(/appSecret/);
    expect(() => client(f, { redirectUri: `${FIXTURE_REDIRECT_URI}#x` })).toThrow(/fragment/);
    expect(() => client(f).buildAuthorizeUrl('')).toThrow(/state/);
  });
  it('không truyền fetch → dùng fetch toàn cục', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(accessTokenResponse('T'))));
    vi.stubGlobal('fetch', spy);
    try {
      const c = createFacebookOAuthClient({
        appId: FIXTURE_APP_ID,
        appSecret: FIXTURE_APP_SECRET,
        redirectUri: FIXTURE_REDIRECT_URI,
      });
      await expect(c.exchangeCode('CODE')).resolves.toBe('T');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('thân phản hồi quá lớn → lỗi nền tảng (không rơi vào facebook_network_error)', async () => {
    const big = (async () =>
      new Response('x', { headers: { 'content-length': '99999999' } })) as unknown as typeof fetch;
    await expect(client(big).getTokenOwnerId('t')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
  it('me/accounts sai dạng, me sai dạng → UNKNOWN; tasks thiếu → []', async () => {
    const badAccounts = client(mockFetch(() => ({ body: { data: 'x' } })).fn);
    await expect(badAccounts.listPages('t')).rejects.toMatchObject({ code: 'UNKNOWN' });
    const badMe = client(mockFetch(() => ({ body: { id: 'abc' } })).fn);
    await expect(badMe.getTokenOwnerId('t')).rejects.toMatchObject({ code: 'UNKNOWN' });
    const noTasks = client(
      mockFetch(() => ({ body: { data: [{ id: '1', name: 'P', access_token: 'tk' }] } })).fn,
    );
    await expect(noTasks.listPages('t')).resolves.toEqual([
      { id: '1', name: 'P', accessToken: 'tk', tasks: [] },
    ]);
  });
  it('phản hồi 200 không phải JSON → UNKNOWN', async () => {
    const raw = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(client(raw).exchangeCode('CODE')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});

describe('buildAuthorizeUrl', () => {
  it('dùng v27.0, state, redirect cố định và scope khi không có config_id', () => {
    const url = new URL(client(mockFetch(() => ({ body: {} })).fn).buildAuthorizeUrl('S1'));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v27.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe(FIXTURE_APP_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(FIXTURE_REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe('S1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('pages_manage_metadata');
    expect(url.searchParams.has('config_id')).toBe(false);
    expect(url.toString()).not.toContain(FIXTURE_APP_SECRET);
  });

  it('có config_id → Login for Business (config_id + override_default_response_type, không scope)', () => {
    const url = new URL(
      client(mockFetch(() => ({ body: {} })).fn, { loginConfigId: '998877' }).buildAuthorizeUrl(
        'S',
      ),
    );
    expect(url.searchParams.get('config_id')).toBe('998877');
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('từ chối redirectUri http (trừ localhost) và thiếu cấu hình', () => {
    const f = mockFetch(() => ({ body: {} })).fn;
    expect(() => client(f, { redirectUri: 'http://app.example.test/cb' })).toThrow();
    expect(() => client(f, { redirectUri: 'http://localhost:3000/cb' })).not.toThrow();
    expect(() => client(f, { appSecret: '' })).toThrow();
    expect(() => client(f, { apiVersion: '27' })).toThrow();
  });
});

describe('exchangeCode / extendUserToken', () => {
  it('đổi code theo tài liệu rồi đổi sang token dài hạn', async () => {
    const { fn, calls } = mockFetch((url) =>
      url.searchParams.get('grant_type') === 'fb_exchange_token'
        ? { body: accessTokenResponse(FIXTURE_LONG_TOKEN) }
        : { body: accessTokenResponse(FIXTURE_SHORT_TOKEN) },
    );
    const c = client(fn);
    expect(await c.exchangeCode('CODE1')).toBe(FIXTURE_SHORT_TOKEN);
    expect(await c.extendUserToken(FIXTURE_SHORT_TOKEN)).toBe(FIXTURE_LONG_TOKEN);
    expect(calls[0]?.url.pathname).toBe('/v27.0/oauth/access_token');
    expect(calls[0]?.url.searchParams.get('code')).toBe('CODE1');
    expect(calls[0]?.url.searchParams.get('redirect_uri')).toBe(FIXTURE_REDIRECT_URI);
    expect(calls[1]?.url.searchParams.get('fb_exchange_token')).toBe(FIXTURE_SHORT_TOKEN);
  });

  it('code rỗng → lỗi, không gọi mạng', async () => {
    const { fn, calls } = mockFetch(() => ({ body: {} }));
    await expect(client(fn).exchangeCode('')).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(calls).toHaveLength(0);
  });

  it('thân thiếu access_token → facebook_bad_response', async () => {
    const { fn } = mockFetch(() => ({ body: { token_type: 'bearer' } }));
    await expect(client(fn).exchangeCode('C')).rejects.toMatchObject({
      message: 'facebook_bad_response',
    });
  });
});

describe('listPages', () => {
  it('đọc đủ các trang, bỏ trùng và dòng hỏng, ký appsecret_proof', async () => {
    const { fn, calls } = mockFetch((url) =>
      url.searchParams.has('after')
        ? { body: accountsResponse(PAGE_B, PAGE_A) }
        : {
            body: {
              ...accountsPageWithNext('CURSOR2', PAGE_A),
              data: [...accountsPageWithNext('CURSOR2', PAGE_A).data, { id: 'x', name: '' }],
            },
          },
    );
    const pages = await client(fn).listPages(FIXTURE_LONG_TOKEN);
    expect(pages.map((p) => p.id)).toEqual([PAGE_A.id, PAGE_B.id]);
    expect(pages[0]?.accessToken).toBe(PAGE_A.token);
    expect(pages[0]?.tasks).toContain('MANAGE');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url.pathname).toBe('/v27.0/me/accounts');
    expect(calls[1]?.url.searchParams.get('after')).toBe('CURSOR2');
    expect(calls[0]?.url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('phân trang vô hạn → lỗi, không trả danh sách thiếu', async () => {
    const { fn } = mockFetch(() => ({ body: accountsPageWithNext('SAME', PAGE_A) }));
    await expect(client(fn).listPages(FIXTURE_LONG_TOKEN)).rejects.toMatchObject({
      message: 'facebook_too_many_pages',
    });
  });
});

describe('getTokenOwnerId', () => {
  it('trả id của token', async () => {
    const { fn, calls } = mockFetch(() => ({ body: meResponse(PAGE_A.id) }));
    expect(await client(fn).getTokenOwnerId(PAGE_A.token)).toBe(PAGE_A.id);
    expect(calls[0]?.url.pathname).toBe('/v27.0/me');
    expect(calls[0]?.url.searchParams.get('fields')).toBe('id');
  });
});

describe('lỗi không lộ bí mật', () => {
  const secrets = [
    FIXTURE_APP_SECRET,
    FIXTURE_SHORT_TOKEN,
    FIXTURE_LONG_TOKEN,
    PAGE_A.token,
    'graph.facebook.com',
    'fixture message',
  ];
  const scenarios: [string, (url: URL) => { status?: number; body: unknown } | Error][] = [
    ['190', () => ({ status: 400, body: graphError(190, 463) })],
    ['100', () => ({ status: 400, body: graphError(100) })],
    ['HTTP 200 kèm error', () => ({ body: graphError(4) })],
    [
      'mạng lỗi chứa URL+token',
      () => new Error(`ECONNRESET https://graph.facebook.com/?access_token=${PAGE_A.token}`),
    ],
    ['thân rác', () => ({ status: 502, body: '<html>' })],
  ];
  for (const [name, handler] of scenarios) {
    it(name, async () => {
      const c = client(mockFetch(handler).fn);
      for (const run of [
        () => c.exchangeCode('CODE'),
        () => c.extendUserToken(FIXTURE_SHORT_TOKEN),
        () => c.listPages(FIXTURE_LONG_TOKEN),
        () => c.getTokenOwnerId(PAGE_A.token),
      ]) {
        const error = await run().then(
          () => null,
          (e: unknown) => e,
        );
        expect(isPlatformError(error)).toBe(true);
        const dump =
          JSON.stringify(error, Object.getOwnPropertyNames(error as object)) +
          String((error as Error).stack);
        for (const secret of secrets) expect(dump).not.toContain(secret);
        expect((error as { cause?: unknown }).cause).toBeUndefined();
      }
    });
  }

  it('190 → TOKEN_EXPIRED, 4 → RATE_LIMIT', async () => {
    const a = client(mockFetch(() => ({ status: 400, body: graphError(190) })).fn);
    await expect(a.listPages('t')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    const b = client(mockFetch(() => ({ status: 400, body: graphError(4) })).fn);
    await expect(b.listPages('t')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });
});
