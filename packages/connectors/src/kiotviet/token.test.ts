import { describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../errors';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_TOKEN,
  jsonResponse,
  tokenBody,
} from './fixtures';
import { createKiotVietTokenProvider, type KiotVietTokenProviderOptions } from './token';

const CREDENTIALS = { clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET };

function harness(
  responses: Array<Response | Error>,
  over: Partial<KiotVietTokenProviderOptions> = {},
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    if (next instanceof Error) throw next;
    return next;
  });
  let now = 1_000_000;
  const provider = createKiotVietTokenProvider({
    getCredentials: async () => CREDENTIALS,
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => now,
    ...over,
  });
  return { provider, calls, advance: (ms: number) => (now += ms) };
}

const failureOf = async (promise: Promise<unknown>): Promise<PlatformError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PlatformError);
    return error as PlatformError;
  }
  throw new Error('không ném lỗi');
};

describe('FR-122 createKiotVietTokenProvider', () => {
  it('POST máy chủ cố định bằng form client credentials, bí mật chỉ ở thân', async () => {
    const { provider, calls } = harness([jsonResponse(tokenBody())]);
    expect(await provider()).toBe(FAKE_TOKEN);
    const call = calls[0];
    expect(call?.url).toBe('https://id.kiotviet.vn/connect/token');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.redirect).toBe('error');
    const form = new URLSearchParams(String(call?.init.body));
    expect(form.get('grant_type')).toBe('client_credentials');
    expect(form.get('scopes')).toBe('PublicApi.Access');
    expect(form.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(form.get('client_secret')).toBe(FAKE_CLIENT_SECRET);
    expect(call?.url).not.toContain(FAKE_CLIENT_SECRET);
  });

  it('dùng lại token đến gần hết hạn rồi xin mới', async () => {
    const { provider, calls, advance } = harness([
      jsonResponse(tokenBody({ expires_in: 3600 })),
      jsonResponse(tokenBody({ access_token: 'tt-two', expires_in: 3600 })),
    ]);
    expect(await provider()).toBe(FAKE_TOKEN);
    advance(3_000 * 1000);
    expect(await provider()).toBe(FAKE_TOKEN);
    expect(calls).toHaveLength(1);
    advance(600 * 1000);
    expect(await provider()).toBe('tt-two');
    expect(calls).toHaveLength(2);
  });

  it('gộp các lời gọi đồng thời thành một lần xin', async () => {
    const { provider, calls } = harness([jsonResponse(tokenBody())]);
    const [a, b] = await Promise.all([provider(), provider()]);
    expect([a, b]).toEqual([FAKE_TOKEN, FAKE_TOKEN]);
    expect(calls).toHaveLength(1);
  });

  it('lỗi không được nhớ: lần sau xin lại', async () => {
    const { provider, calls } = harness([
      new Response('', { status: 500 }),
      jsonResponse(tokenBody()),
    ]);
    await failureOf(provider());
    expect(await provider()).toBe(FAKE_TOKEN);
    expect(calls).toHaveLength(2);
  });

  it.each([
    [400, 'TOKEN_EXPIRED', 'kiotviet_token_rejected'],
    [401, 'TOKEN_EXPIRED', 'kiotviet_token_rejected'],
    [429, 'RATE_LIMIT', 'kiotviet_rate_limited'],
    [500, 'UNKNOWN', 'kiotviet_token_http_error'],
  ])('HTTP %i → %s, không lộ bí mật', async (status, code, message) => {
    const { provider } = harness([new Response(`lộ ${FAKE_CLIENT_SECRET}`, { status })]);
    const error = await failureOf(provider());
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.message).not.toContain(FAKE_CLIENT_SECRET);
  });

  it('429 kèm Retry-After → retryAfterSeconds', async () => {
    const { provider } = harness([
      new Response('', { status: 429, headers: { 'retry-after': '5' } }),
    ]);
    expect((await failureOf(provider())).retryAfterSeconds).toBe(5);
  });

  it('lỗi mạng → UNKNOWN kiotviet_network_error', async () => {
    const { provider } = harness([new Error(`boom ${FAKE_CLIENT_SECRET}`)]);
    const error = await failureOf(provider());
    expect(error.message).toBe('kiotviet_network_error');
  });

  it.each([
    ['không phải json', new Response('xx', { status: 200 })],
    ['thiếu access_token', jsonResponse({ expires_in: 10 })],
    ['access_token rỗng', jsonResponse(tokenBody({ access_token: '' }))],
    ['expires_in sai', jsonResponse(tokenBody({ expires_in: 'x' }))],
    ['không có thân', new Response(null, { status: 200 })],
  ])('phản hồi hỏng (%s) → bad_response', async (_name, response) => {
    const { provider } = harness([response]);
    expect((await failureOf(provider())).message).toBe('kiotviet_bad_response');
  });

  it('thân quá lớn bị từ chối', async () => {
    const { provider } = harness([
      new Response('{}', { status: 200, headers: { 'content-length': String(32 * 1024 * 1024) } }),
    ]);
    expect((await failureOf(provider())).message).toBe('kiotviet_bad_response');
  });

  it('getCredentials lỗi: PlatformError giữ nguyên; lỗi khác → TOKEN_EXPIRED', async () => {
    const own = new PlatformError('PERMISSION', { message: 'kiotviet_forbidden' });
    const a = harness([], {
      getCredentials: async () => {
        throw own;
      },
    });
    expect(await failureOf(a.provider())).toBe(own);
    const b = harness([], {
      getCredentials: async () => {
        throw new Error(`lộ ${FAKE_CLIENT_SECRET}`);
      },
    });
    const error = await failureOf(b.provider());
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(error.message).toBe('kiotviet_credentials_unavailable');
  });

  it('timeoutMs không hợp lệ bị từ chối', () => {
    expect(() => harness([], { timeoutMs: 0 })).toThrow();
    expect(() => harness([], { timeoutMs: 60_001 })).toThrow();
  });
});
