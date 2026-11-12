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

describe('listPages — includeGranted (Page được cấp ở hộp thoại nhưng me/accounts bỏ sót)', () => {
  const debug = (targets: string[], scope = 'pages_show_list') => ({
    data: { is_valid: true, scopes: [scope], granular_scopes: [{ scope, target_ids: targets }] },
  });
  const pageNode = (page: { id: string; name: string; token: string }) => ({
    id: page.id,
    name: page.name,
    access_token: page.token,
    tasks: ['MANAGE'],
  });

  it('me/accounts trả rỗng nhưng Meta báo Page đã cấp → lấy thẳng Page theo ID (token người dùng, ký proof)', async () => {
    const { fn, calls } = mockFetch((url) => {
      if (url.pathname.endsWith('/me/accounts')) return { body: { data: [] } };
      if (url.pathname.endsWith('/debug_token')) return { body: debug([PAGE_A.id]) };
      if (url.pathname.endsWith(`/${PAGE_A.id}`)) return { body: pageNode(PAGE_A) };
      return { status: 404, body: graphError(100) };
    });
    const pages = await client(fn).listPages(FIXTURE_LONG_TOKEN, { includeGranted: true });
    expect(pages).toEqual([
      { id: PAGE_A.id, name: PAGE_A.name, accessToken: PAGE_A.token, tasks: ['MANAGE'] },
    ]);
    const direct = calls.find((c) => c.url.pathname.endsWith(`/${PAGE_A.id}`));
    expect(direct?.url.searchParams.get('fields')).toBe('id,name,access_token,tasks');
    expect(direct?.url.searchParams.get('access_token')).toBe(FIXTURE_LONG_TOKEN);
    expect(direct?.url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('không trùng Page đã có ở me/accounts; bỏ ID sai dạng; Page lỗi/thiếu token bị bỏ, Page còn lại vẫn trả', async () => {
    const { fn, calls } = mockFetch((url) => {
      if (url.pathname.endsWith('/me/accounts')) return { body: accountsResponse(PAGE_A) };
      if (url.pathname.endsWith('/debug_token')) {
        return { body: debug([PAGE_A.id, PAGE_B.id, '../x', '999']) };
      }
      if (url.pathname.endsWith(`/${PAGE_B.id}`)) return { body: pageNode(PAGE_B) };
      if (url.pathname.endsWith('/999')) return { status: 403, body: graphError(200) };
      return { status: 404, body: graphError(100) };
    });
    const pages = await client(fn).listPages(FIXTURE_LONG_TOKEN, { includeGranted: true });
    expect(pages.map((p) => p.id)).toEqual([PAGE_A.id, PAGE_B.id]);
    expect(calls.some((c) => c.url.pathname.endsWith(`/${PAGE_A.id}`))).toBe(false);
    expect(calls.some((c) => c.url.pathname.includes('..'))).toBe(false);
  });

  it('hỏi quyền (debug_token) lỗi → trả đúng kết quả me/accounts, không ném; mặc định không gọi debug_token', async () => {
    const failing = mockFetch((url) =>
      url.pathname.endsWith('/debug_token')
        ? { status: 500, body: {} }
        : { body: accountsResponse(PAGE_A) },
    );
    const pages = await client(failing.fn).listPages(FIXTURE_LONG_TOKEN, { includeGranted: true });
    expect(pages.map((p) => p.id)).toEqual([PAGE_A.id]);
    const plain = mockFetch(() => ({ body: accountsResponse(PAGE_A) }));
    await client(plain.fn).listPages(FIXTURE_LONG_TOKEN);
    expect(plain.calls.some((c) => c.url.pathname.endsWith('/debug_token'))).toBe(false);
  });

  it('chỉ xét quyền pages_* và tối đa 20 Page lấy theo ID (trần chi phí)', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(200000000000000 + i));
    const { fn, calls } = mockFetch((url) => {
      if (url.pathname.endsWith('/me/accounts')) return { body: { data: [] } };
      if (url.pathname.endsWith('/debug_token')) {
        return {
          body: {
            data: {
              is_valid: true,
              scopes: ['pages_show_list', 'business_management'],
              granular_scopes: [
                { scope: 'pages_show_list', target_ids: ids },
                { scope: 'business_management', target_ids: ['777000000000001'] },
              ],
            },
          },
        };
      }
      const id = url.pathname.split('/').pop() as string;
      return { body: pageNode({ id, name: `P${id}`, token: `T${id}` }) };
    });
    const pages = await client(fn).listPages(FIXTURE_LONG_TOKEN, { includeGranted: true });
    expect(pages).toHaveLength(20);
    expect(calls.some((c) => c.url.pathname.endsWith('/777000000000001'))).toBe(false);
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

describe('buildAuthorizeUrl — xin lại quyền (rerequest)', () => {
  it('rerequest → auth_type=rerequest; không có thì không đặt; Login for Business (config_id) không dùng auth_type', () => {
    const plain = new URL(client(mockFetch(() => ({ body: {} })).fn).buildAuthorizeUrl('S1'));
    expect(plain.searchParams.has('auth_type')).toBe(false);
    const again = new URL(
      client(mockFetch(() => ({ body: {} })).fn).buildAuthorizeUrl('S1', { rerequest: true }),
    );
    expect(again.searchParams.get('auth_type')).toBe('rerequest');
    expect(again.searchParams.get('scope')).toContain('pages_manage_engagement');
    const business = new URL(
      client(mockFetch(() => ({ body: {} })).fn, { loginConfigId: '998877' }).buildAuthorizeUrl(
        'S1',
        { rerequest: true },
      ),
    );
    expect(business.searchParams.has('auth_type')).toBe(false);
  });
});

describe('debugToken — quyền ĐÃ CẤP của token người dùng', () => {
  it('gọi /debug_token bằng token ứng dụng (không dùng token người dùng làm access_token) và trả quyền đã cấp', async () => {
    const { fn, calls } = mockFetch(() => ({
      body: {
        data: {
          is_valid: true,
          scopes: ['pages_show_list', 'pages_read_engagement'],
          granular_scopes: [{ scope: 'pages_read_engagement', target_ids: ['111'] }],
          expires_at: 0,
        },
      },
    }));
    const info = await client(fn).debugToken(FIXTURE_LONG_TOKEN);
    expect(info).toMatchObject({
      valid: true,
      scopes: ['pages_read_engagement', 'pages_show_list'],
      granular: [{ scope: 'pages_read_engagement', targetIds: ['111'] }],
      expiresAt: null,
    });
    const [call] = calls;
    expect(call?.url.pathname).toBe('/v27.0/debug_token');
    expect(call?.url.searchParams.get('input_token')).toBe(FIXTURE_LONG_TOKEN);
    expect(call?.url.searchParams.get('access_token')).toBe(
      `${FIXTURE_APP_ID}|${FIXTURE_APP_SECRET}`,
    );
    expect(call?.method).toBe('GET');
  });

  it('token không hợp lệ → valid=false (không ném); thân sai hình dạng và lỗi Graph → lỗi không lộ token/khóa', async () => {
    const dead = mockFetch(() => ({ body: { data: { is_valid: false } } }));
    expect((await client(dead.fn).debugToken(FIXTURE_LONG_TOKEN)).valid).toBe(false);
    const bad = mockFetch(() => ({ body: { nope: 1 } }));
    const error = await client(bad.fn)
      .debugToken(FIXTURE_LONG_TOKEN)
      .catch((e: unknown) => e);
    expect(isPlatformError(error)).toBe(true);
    expect(JSON.stringify(error)).not.toContain(FIXTURE_LONG_TOKEN);
    expect(String((error as Error).message)).not.toContain(FIXTURE_APP_SECRET);
    const denied = mockFetch(() => ({ status: 400, body: graphError(190) }));
    const e2 = await client(denied.fn)
      .debugToken(FIXTURE_LONG_TOKEN)
      .catch((e: unknown) => e);
    expect(isPlatformError(e2)).toBe(true);
    expect(JSON.stringify(e2)).not.toContain(FIXTURE_LONG_TOKEN);
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
