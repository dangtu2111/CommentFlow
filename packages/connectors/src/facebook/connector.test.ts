import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkConnectorContract } from '../contract';
import { DECLARED_CAPABILITIES } from '../declarations';
import { isPlatformError, PlatformError } from '../errors';
import type { ChannelRef } from '../types';
import {
  createFacebookConnector,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  type FacebookConnectorOptions,
  MAX_RESPONSE_BYTES,
} from './connector';
import {
  APP_ID,
  APP_SECRET,
  APP_USAGE_HEADER,
  BUC_HEADER,
  EMPTY_PAGE,
  FEED_PAGE,
  graphError,
  PAGE_ID,
  POST_COMMENTS_MIXED,
  REPLIES_PAGE_1,
  REPLIES_PAGE_2,
  REPLY_CREATED,
  SUBSCRIBED_APPS,
  SUBSCRIBED_APPS_NONE,
  SUCCESS_FALSE,
  SUCCESS_TRUE,
  TOKEN,
} from './connector.fixtures';
import { signMetaBody } from './webhook';

const channel: ChannelRef = {
  id: 'ch-1',
  workspaceId: 'ws-1',
  platform: 'facebook',
  externalId: PAGE_ID,
};

type Call = { url: URL; init: RequestInit };
type Reply = Response | Error | (() => Response | Promise<Response>);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

function harness(replies: Reply[], overrides: Partial<FacebookConnectorOptions> = {}) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetchFake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  const connector = createFacebookConnector({
    tokenProvider: { getAccessToken: vi.fn(async () => TOKEN) },
    appId: APP_ID,
    appSecret: APP_SECRET,
    fetch: fetchFake as unknown as typeof fetch,
    ...overrides,
  });
  return { connector, calls, fetchFake };
}

const bodyOf = (call: Call) => new URLSearchParams(String(call.init.body));
const proofOf = (token: string) => createHmac('sha256', APP_SECRET).update(token).digest('hex');

async function failureOf(promise: Promise<unknown>): Promise<PlatformError> {
  try {
    await promise;
  } catch (error) {
    expect(isPlatformError(error)).toBe(true);
    return error as PlatformError;
  }
  throw new Error('đáng lẽ phải ném lỗi');
}

describe('Facebook connector — cấu hình và hợp đồng chung', () => {
  it('thỏa checkConnectorContract và dùng khai báo khả năng Facebook', () => {
    const { connector } = harness([]);
    expect(checkConnectorContract(connector)).toEqual([]);
    expect(connector.platform).toBe('facebook');
    expect(connector.capabilities.reply).toEqual(DECLARED_CAPABILITIES.facebook.reply);
    expect(connector.capabilities.hide).toEqual(DECLARED_CAPABILITIES.facebook.hide);
    expect(connector.capabilities.privateReply.supported).toBe(false);
    expect(connector.capabilities.sendMessage.supported).toBe(false);
  });

  it('từ chối cấu hình sai: khóa ứng dụng rỗng, timeout quá lớn/không dương, phiên bản sai', () => {
    const tokenProvider = { getAccessToken: async () => TOKEN };
    const base = { tokenProvider, appId: APP_ID, appSecret: APP_SECRET };
    expect(() => createFacebookConnector({ ...base, appSecret: '' })).toThrow();
    expect(() => createFacebookConnector({ ...base, appId: '' })).toThrow();
    expect(() => createFacebookConnector({ ...base, timeoutMs: 60_001 })).toThrow();
    expect(() => createFacebookConnector({ ...base, timeoutMs: 0 })).toThrow();
    expect(() => createFacebookConnector({ ...base, apiVersion: '27' })).toThrow();
    expect(() => createFacebookConnector({ ...base, timeoutMs: 60_000 })).not.toThrow();
  });
});

describe('reply — POST /{comment-id}/comments', () => {
  it('gửi message trong thân POST kèm token + appsecret_proof, trả id mới; token KHÔNG nằm trong URL', async () => {
    const { connector, calls } = harness([json(REPLY_CREATED)]);
    const result = await connector.reply(channel, '3000000000003_4000000000001', 'Chào bạn');
    expect(result).toEqual({ externalId: REPLY_CREATED.id });
    expect(calls).toHaveLength(1);
    const [call] = calls as [Call];
    expect(call.init.method).toBe('POST');
    expect(call.url.origin).toBe('https://graph.facebook.com');
    expect(call.url.pathname).toBe('/v27.0/3000000000003_4000000000001/comments');
    expect(call.url.search).toBe('');
    const body = bodyOf(call);
    expect(body.get('message')).toBe('Chào bạn');
    expect(body.get('access_token')).toBe(TOKEN);
    expect(body.get('appsecret_proof')).toBe(proofOf(TOKEN));
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('phản hồi 200 thiếu id / không phải JSON / rỗng → UNKNOWN (không biết đã gửi hay chưa)', async () => {
    for (const reply of [
      json({}),
      json({ id: '' }),
      new Response('<html>', { status: 200 }),
      new Response('', { status: 200 }),
    ]) {
      const { connector } = harness([reply]);
      const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
      expect(error.code).toBe('UNKNOWN');
    }
  });

  it('HTTP 200 nhưng thân là lỗi Graph (code 190) → vẫn phân loại theo error.code', async () => {
    const { connector } = harness([json(graphError(190), 200)]);
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    expect(error.code).toBe('TOKEN_EXPIRED');
  });

  it('lỗi mạng, timeout, 5xx ở bước ghi → UNKNOWN; đúng 1 lần gọi (không retry ngầm)', async () => {
    const cases: Reply[] = [
      new TypeError('fetch failed'),
      json({}, 500),
      new Response('Bad Gateway', { status: 502 }),
      new Response('', { status: 503 }),
    ];
    for (const reply of cases) {
      const { connector, fetchFake } = harness([reply, json(REPLY_CREATED)]);
      const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
      expect(error.code).toBe('UNKNOWN');
      expect(fetchFake).toHaveBeenCalledTimes(1);
    }
  });

  it('cắt timeout bằng AbortSignal: fetch treo → UNKNOWN sau timeoutMs', async () => {
    const hang = (_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const connector = createFacebookConnector({
      tokenProvider: { getAccessToken: async () => TOKEN },
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: hang as unknown as typeof fetch,
      timeoutMs: 30,
    });
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).not.toContain(TOKEN);
  });

  it('token không dùng được → TOKEN_EXPIRED từ provider, KHÔNG gọi mạng', async () => {
    const { connector, fetchFake } = harness([], {
      tokenProvider: {
        getAccessToken: async () => {
          throw new PlatformError('TOKEN_EXPIRED');
        },
      },
    });
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it('lỗi hạ tầng của provider (không phải PlatformError) → UNKNOWN, không lộ lỗi gốc', async () => {
    const { connector } = harness([], {
      tokenProvider: {
        getAccessToken: async () => {
          throw new Error(`DB lỗi ${TOKEN}`);
        },
      },
    });
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    expect(error.code).toBe('UNKNOWN');
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(error.message).not.toContain(TOKEN);
    expect(error.cause).toBeUndefined();
  });
});

describe('phân loại lỗi Graph API → 5 mã chuẩn (docs/12 §1, error-handling, rate-limiting)', () => {
  const table: Array<[string, unknown, number, string]> = [
    ['190 token hết hạn', graphError(190), 400, 'TOKEN_EXPIRED'],
    ['190 kèm subcode 463', graphError(190, { subcode: 463 }), 401, 'TOKEN_EXPIRED'],
    ['190 kèm subcode 460 (đổi mật khẩu)', graphError(190, { subcode: 460 }), 400, 'TOKEN_EXPIRED'],
    ['102 phiên API (token)', graphError(102), 400, 'TOKEN_EXPIRED'],
    ['10 quyền bị từ chối', graphError(10), 403, 'PERMISSION'],
    ['200 lỗi quyền', graphError(200), 403, 'PERMISSION'],
    ['283 (trong 200–299)', graphError(283), 403, 'PERMISSION'],
    ['299 (biên 200–299)', graphError(299), 403, 'PERMISSION'],
    ['4 giới hạn ứng dụng', graphError(4), 400, 'RATE_LIMIT'],
    ['17 giới hạn người dùng', graphError(17), 400, 'RATE_LIMIT'],
    ['32 giới hạn Page', graphError(32), 400, 'RATE_LIMIT'],
    ['613 giới hạn tùy biến', graphError(613), 400, 'RATE_LIMIT'],
    ['80001 quá nhiều lệnh gọi tới Page', graphError(80001), 400, 'RATE_LIMIT'],
    ['341 giới hạn ứng dụng', graphError(341), 400, 'RATE_LIMIT'],
    ['368 bị chặn tạm', graphError(368), 400, 'BLOCKED'],
    ['100 tham số không hợp lệ', graphError(100), 400, 'UNKNOWN'],
    ['2 sự cố dịch vụ', graphError(2), 500, 'UNKNOWN'],
    ['1 không xác định', graphError(1), 500, 'UNKNOWN'],
    ['mã không biết', graphError(99999), 400, 'UNKNOWN'],
    ['201 không có trong bảng nhưng thuộc 200–299', graphError(201), 400, 'PERMISSION'],
    ['code không phải số', { error: { message: 'x', code: 'abc' } }, 400, 'UNKNOWN'],
    ['thiếu code', { error: { message: 'x' } }, 400, 'UNKNOWN'],
  ];

  it.each(table)('%s', async (_name, body, status, expected) => {
    const { connector } = harness([json(body, status)]);
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    expect(error.code).toBe(expected);
  });

  it('HTTP 429 không thân JSON → RATE_LIMIT', async () => {
    const { connector } = harness([new Response('', { status: 429 })]);
    expect((await failureOf(connector.reply(channel, '4000000000001', 'x'))).code).toBe(
      'RATE_LIMIT',
    );
  });

  it('retryAfterSeconds lấy từ X-Business-Use-Case-Usage (phút → giây); X-App-Usage không có → undefined', async () => {
    const withBuc = harness([
      json(graphError(80001), 400, { 'x-business-use-case-usage': BUC_HEADER }),
    ]);
    const e1 = await failureOf(withBuc.connector.reply(channel, '4000000000001', 'x'));
    expect(e1.retryAfterSeconds).toBe(300);
    const withApp = harness([json(graphError(4), 400, { 'x-app-usage': APP_USAGE_HEADER })]);
    const e2 = await failureOf(withApp.connector.reply(channel, '4000000000001', 'x'));
    expect(e2.retryAfterSeconds).toBeUndefined();
  });

  it('header lạ/hỏng/âm/quá lớn → bỏ qua, không ném', async () => {
    for (const value of [
      'khong phai json',
      '[]',
      '{"a":[{"estimated_time_to_regain_access":-3}]}',
      '{"a":[{"estimated_time_to_regain_access":"x"}]}',
      '{"a":"x"}',
    ]) {
      const { connector } = harness([
        json(graphError(32), 400, { 'x-business-use-case-usage': value }),
      ]);
      const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
      expect(error.code).toBe('RATE_LIMIT');
      expect(error.retryAfterSeconds).toBeUndefined();
    }
    const big = JSON.stringify({ a: [{ estimated_time_to_regain_access: 999_999 }] });
    const { connector } = harness([
      json(graphError(32), 400, { 'x-business-use-case-usage': big }),
    ]);
    expect(
      (await failureOf(connector.reply(channel, '4000000000001', 'x'))).retryAfterSeconds,
    ).toBe(86_400);
  });

  it('thông báo lỗi chỉ chứa mã: không có token, nội dung/tên khách, message của Meta, URL; không có cause', async () => {
    const leaky = `Nội dung bình luận của khách Nguyễn Văn A 0901234567 ${TOKEN}`;
    const { connector } = harness([
      json(
        {
          error: {
            message: leaky,
            type: 'OAuthException',
            code: 190,
            error_user_msg: leaky,
            fbtrace_id: 'T',
          },
        },
        400,
      ),
    ]);
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    const dump = `${error.message} ${error.name} ${JSON.stringify(error)} ${String(error.stack).split('\n')[0]}`;
    for (const secret of [TOKEN, 'Nguyễn Văn A', '0901234567', 'graph.facebook.com', APP_SECRET]) {
      expect(dump).not.toContain(secret);
    }
    expect(error.cause).toBeUndefined();
    expect(error.message).toBe('facebook_error_190');
  });

  it('lỗi mạng mang token trong thông báo gốc → không lọt ra ngoài', async () => {
    const { connector } = harness([
      new TypeError(`fetch failed https://graph.facebook.com/x?access_token=${TOKEN}`),
    ]);
    const error = await failureOf(connector.reply(channel, '4000000000001', 'x'));
    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(error.message).not.toContain(TOKEN);
    expect(error.cause).toBeUndefined();
  });

  it('mapError: PlatformError giữ nguyên; giá trị lạ → UNKNOWN không kèm cause', () => {
    const { connector } = harness([]);
    const original = new PlatformError('BLOCKED');
    expect(connector.mapError(original)).toBe(original);
    for (const value of [new Error('x'), 'chuỗi', null, undefined, 42, { code: 190 }]) {
      const mapped = connector.mapError(value);
      expect(mapped.code).toBe('UNKNOWN');
      expect(mapped.cause).toBeUndefined();
    }
  });
});

describe('setHidden — POST /{comment-id} is_hidden', () => {
  it.each([
    [true, 'true'],
    [false, 'false'],
  ])('hidden=%s gửi is_hidden=%s', async (hidden, wire) => {
    const { connector, calls } = harness([json(SUCCESS_TRUE)]);
    await connector.setHidden(channel, '4000000000001', hidden);
    const [call] = calls as [Call];
    expect(call.init.method).toBe('POST');
    expect(call.url.pathname).toBe('/v27.0/4000000000001');
    expect(call.url.search).toBe('');
    const body = bodyOf(call);
    expect(body.get('is_hidden')).toBe(wire);
    expect(body.get('access_token')).toBe(TOKEN);
    expect(body.get('appsecret_proof')).toBe(proofOf(TOKEN));
  });

  it('success:false / thân lạ / rỗng → UNKNOWN', async () => {
    for (const reply of [
      json(SUCCESS_FALSE),
      json({}),
      json([]),
      new Response('', { status: 200 }),
    ]) {
      const { connector } = harness([reply]);
      expect((await failureOf(connector.setHidden(channel, '4000000000001', true))).code).toBe(
        'UNKNOWN',
      );
    }
  });

  it('lỗi quyền/giới hạn/chặn được phân loại như reply; 5xx và timeout → UNKNOWN, một lần gọi', async () => {
    const perm = harness([json(graphError(200), 403)]);
    expect((await failureOf(perm.connector.setHidden(channel, '4000000000001', true))).code).toBe(
      'PERMISSION',
    );
    const blocked = harness([json(graphError(368), 400)]);
    expect(
      (await failureOf(blocked.connector.setHidden(channel, '4000000000001', true))).code,
    ).toBe('BLOCKED');
    const five = harness([json({}, 500), json(SUCCESS_TRUE)]);
    expect((await failureOf(five.connector.setHidden(channel, '4000000000001', true))).code).toBe(
      'UNKNOWN',
    );
    expect(five.fetchFake).toHaveBeenCalledTimes(1);
  });
});

describe('fetchReplies — GET /{comment-id}/comments, phân trang bằng `after`', () => {
  it('đọc hết các trang, chuẩn hóa, isFromPage theo from.id == Page, KHÔNG đi theo URL `next`', async () => {
    const { connector, calls } = harness([json(REPLIES_PAGE_1), json(REPLIES_PAGE_2)]);
    const parent = '3000000000003_4000000000001';
    const comments = await connector.fetchReplies(channel, parent, {
      postExternalId: '3000000000003',
    });
    expect(comments.map((c) => c.externalId)).toEqual([
      '3000000000003_4000000000010',
      '3000000000003_4000000000011',
      '3000000000003_4000000000012',
    ]);
    expect(comments.map((c) => c.isFromPage)).toEqual([true, false, true]);
    expect(comments.every((c) => c.parentExternalId === parent)).toBe(true);
    expect(comments.every((c) => c.postExternalId === '3000000000003')).toBe(true);
    expect(comments[0]).toMatchObject({
      text: 'Cảm ơn bạn',
      authorExternalId: PAGE_ID,
      createdAt: new Date('2026-11-05T03:00:00Z'),
    });
    expect(calls).toHaveLength(2);
    const [first, second] = calls as [Call, Call];
    expect(first.init.method).toBe('GET');
    expect(first.url.pathname).toBe(`/v27.0/${parent}/comments`);
    expect(first.url.searchParams.get('after')).toBeNull();
    expect(first.url.searchParams.get('limit')).toBe('100');
    expect(first.url.searchParams.get('fields')).toContain('message');
    expect(first.url.searchParams.get('access_token')).toBe(TOKEN);
    expect(first.url.searchParams.get('appsecret_proof')).toBe(proofOf(TOKEN));
    expect(second.url.searchParams.get('after')).toBe('AFTER1');
    for (const call of calls) expect(call.url.origin).toBe('https://graph.facebook.com');
  });

  it('trang không có `paging.next` thì dừng, dù có cursors.after', async () => {
    const { connector, fetchFake } = harness([json(REPLIES_PAGE_2)]);
    expect(await connector.fetchReplies(channel, '3000000000003_4000000000001')).toHaveLength(1);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it('`next` có nhưng thiếu cursors.after → UNKNOWN (không đọc dở dang)', async () => {
    const { connector } = harness([json({ data: [], paging: { next: 'https://x' } })]);
    expect(
      (await failureOf(connector.fetchReplies(channel, '3000000000003_4000000000001'))).code,
    ).toBe('UNKNOWN');
  });

  it('vượt giới hạn số trang → UNKNOWN (đọc thiếu thì không được coi là "chưa có câu trả lời")', async () => {
    const endless = () =>
      json({ data: [], paging: { cursors: { after: 'A' }, next: 'https://x' } });
    const { connector, fetchFake } = harness([endless, endless, endless, endless], {
      maxReplyPages: 3,
    });
    expect(
      (await failureOf(connector.fetchReplies(channel, '3000000000003_4000000000001'))).code,
    ).toBe('UNKNOWN');
    expect(fetchFake).toHaveBeenCalledTimes(3);
  });

  it('bình luận thiếu id/created_time/hỏng bị bỏ; thiếu from → isFromPage=false; message thiếu → rỗng', async () => {
    const page = {
      data: [
        { id: 'ok1', created_time: '2026-11-05T03:00:00+0000' },
        { message: 'thiếu id', created_time: '2026-11-05T03:00:00+0000' },
        { id: 'bad-time', message: 'x', created_time: 'hôm qua' },
        { id: 'no-time', message: 'x' },
        {
          id: 'ok2',
          message: 'x',
          created_time: '2026-11-05T03:00:00+0000',
          from: { id: PAGE_ID },
        },
      ],
    };
    const { connector } = harness([json(page)]);
    const comments = await connector.fetchReplies(channel, '3000000000003_4000000000001');
    expect(comments.map((c) => c.externalId)).toEqual(['ok1', 'ok2']);
    expect(comments[0]).toMatchObject({ text: '', isFromPage: false, authorExternalId: '' });
    expect(comments[1]?.isFromPage).toBe(true);
  });

  it('phản hồi sai cấu trúc → UNKNOWN, thông báo không chứa nội dung phản hồi', async () => {
    for (const body of [{ data: 'x' }, { nodata: [] }, [], 'chuỗi bí mật Nguyễn Văn A']) {
      const { connector } = harness([json(body)]);
      const error = await failureOf(connector.fetchReplies(channel, '3000000000003_4000000000001'));
      expect(error.code).toBe('UNKNOWN');
      expect(JSON.stringify(error)).not.toContain('Nguyễn Văn A');
    }
  });

  it('lỗi 190 khi đọc → TOKEN_EXPIRED; trang rỗng → mảng rỗng', async () => {
    const bad = harness([json(graphError(190), 400)]);
    expect(
      (await failureOf(bad.connector.fetchReplies(channel, '3000000000003_4000000000001'))).code,
    ).toBe('TOKEN_EXPIRED');
    const empty = harness([json(EMPTY_PAGE)]);
    expect(await empty.connector.fetchReplies(channel, '3000000000003_4000000000001')).toEqual([]);
  });
});

describe('fetchPostComments — GET /{post-id}/comments (filter=stream)', () => {
  it('đọc mọi cấp bằng filter=stream, lọc theo `since`, ghi postExternalId', async () => {
    const { connector, calls } = harness([json(REPLIES_PAGE_1), json(REPLIES_PAGE_2)]);
    const since = new Date('2026-11-05T03:01:00Z');
    const comments = await connector.fetchPostComments(channel, '3000000000003', { since });
    expect(comments.map((c) => c.externalId)).toEqual([
      '3000000000003_4000000000011',
      '3000000000003_4000000000012',
    ]);
    expect(comments.every((c) => c.postExternalId === '3000000000003')).toBe(true);
    const [first] = calls as [Call];
    expect(first.url.pathname).toBe('/v27.0/3000000000003/comments');
    expect(first.url.searchParams.get('filter')).toBe('stream');
  });

  it('không có `since` → trả tất cả; bình luận cha lấy từ trường parent', async () => {
    const { connector } = harness([json(REPLIES_PAGE_1), json(REPLIES_PAGE_2)]);
    const comments = await connector.fetchPostComments(channel, '3000000000003');
    expect(comments).toHaveLength(3);
    expect(comments[0]?.parentExternalId).toBe('3000000000003_4000000000001');
    expect(comments[1]?.parentExternalId).toBeNull();
  });
});

describe('getTokenPermissions / checkConnection — quyền ĐÃ CẤP của token Page', () => {
  const debug = (extra: Record<string, unknown> = {}) =>
    json({
      data: {
        is_valid: true,
        scopes: ['pages_manage_metadata', 'pages_read_engagement', 'pages_read_user_content'],
        granular_scopes: [{ scope: 'pages_manage_metadata', target_ids: [PAGE_ID] }],
        expires_at: 0,
        ...extra,
      },
    });

  it('getTokenPermissions: gọi /debug_token với input_token = token Page và access_token = token ứng dụng; chỉ quyền áp cho Page này', async () => {
    const { connector, calls } = harness([debug()]);
    const info = await connector.getTokenPermissions(channel);
    expect(info.valid).toBe(true);
    expect(info.pageScopes).toEqual([
      'pages_manage_metadata',
      'pages_read_engagement',
      'pages_read_user_content',
    ]);
    const [call] = calls as [Call];
    expect(call.init.method).toBe('GET');
    expect(call.url.pathname).toBe('/v27.0/debug_token');
    expect(call.url.searchParams.get('input_token')).toBe(TOKEN);
    expect(call.url.searchParams.get('access_token')).toBe(`${APP_ID}|${APP_SECRET}`);
    expect(call.url.searchParams.has('appsecret_proof')).toBe(false);
  });

  it('quyền chỉ cấp cho Page KHÁC (granular) không tính cho kênh này', async () => {
    const { connector } = harness([
      debug({ granular_scopes: [{ scope: 'pages_manage_metadata', target_ids: ['999'] }] }),
    ]);
    const info = await connector.getTokenPermissions(channel);
    expect(info.pageScopes).not.toContain('pages_manage_metadata');
    expect(info.pageScopes).toContain('pages_read_engagement');
  });

  it('checkConnection: kèm quyền đã cấp; hỏi quyền lỗi tạm → bỏ phần quyền, vẫn trả webhook; token hết hiệu lực → TOKEN_EXPIRED', async () => {
    const ok = harness([json(SUBSCRIBED_APPS), debug()]);
    expect(await ok.connector.checkConnection?.(channel)).toEqual({
      webhookSubscribed: true,
      grantedPermissions: [
        'pages_manage_metadata',
        'pages_read_engagement',
        'pages_read_user_content',
      ],
    });
    const flaky = harness([json(SUBSCRIBED_APPS), json({ bad: 1 })]);
    expect(await flaky.connector.checkConnection?.(channel)).toEqual({ webhookSubscribed: true });
    const dead = harness([json(SUBSCRIBED_APPS), json({ data: { is_valid: false } })]);
    expect(
      (await failureOf(dead.connector.checkConnection?.(channel) as Promise<unknown>)).code,
    ).toBe('TOKEN_EXPIRED');
  });
});

describe('POST-PUBLISHING publishPost — POST /{page-id}/feed', () => {
  const POST_CREATED = { id: `${PAGE_ID}_5000000000005` };

  it('đăng chữ lên feed của Page: token + appsecret_proof trong THÂN POST, URL sạch; trả id bài', async () => {
    const { connector, calls } = harness([json(POST_CREATED)]);
    const result = await connector.publishPost(channel, 'Khai trương cửa hàng 🎉');
    expect(result).toEqual({ externalId: POST_CREATED.id });
    expect(calls).toHaveLength(1);
    const [call] = calls as [Call];
    expect(call.init.method).toBe('POST');
    expect(call.url.pathname).toBe(`/v27.0/${PAGE_ID}/feed`);
    expect(call.url.search).toBe('');
    const body = bodyOf(call);
    expect(body.get('message')).toBe('Khai trương cửa hàng 🎉');
    expect(body.get('access_token')).toBe(TOKEN);
    expect(body.get('appsecret_proof')).toBe(proofOf(TOKEN));
  });

  it('nội dung rỗng / chỉ khoảng trắng / quá 63.206 ký tự → từ chối TRƯỚC khi gọi mạng', async () => {
    for (const bad of ['', '   \t ', 'a'.repeat(63207)]) {
      const { connector, calls } = harness([]);
      expect((await failureOf(connector.publishPost(channel, bad))).message).toBe(
        'facebook_invalid_post',
      );
      expect(calls).toHaveLength(0);
    }
  });

  it('phản hồi 200 thiếu id / sai hình dạng → UNKNOWN (có thể ĐÃ đăng: nơi gọi không được thử lại)', async () => {
    for (const body of [{}, { id: '' }, { success: true }]) {
      const { connector } = harness([json(body)]);
      expect((await failureOf(connector.publishPost(channel, 'x'))).code).toBe('UNKNOWN');
    }
  });

  it('lỗi quyền (#200/#10) → PERMISSION; token hết hạn (#190) → TOKEN_EXPIRED; chặn tốc độ (#4) → RATE_LIMIT', async () => {
    const perm = harness([json(graphError(200), 403)]);
    expect((await failureOf(perm.connector.publishPost(channel, 'x'))).code).toBe('PERMISSION');
    const expiredToken = harness([json(graphError(190), 400)]);
    expect((await failureOf(expiredToken.connector.publishPost(channel, 'x'))).code).toBe(
      'TOKEN_EXPIRED',
    );
    const limited = harness([json(graphError(4), 400, { 'x-app-usage': APP_USAGE_HEADER })]);
    expect((await failureOf(limited.connector.publishPost(channel, 'x'))).code).toBe('RATE_LIMIT');
  });
});

describe('COMMENT-AUTHOR-AVATAR fetchCommentAuthorPicture — GET /{comment-id}?fields=from{picture}', () => {
  const COMMENT = `${PAGE_ID}_3000000000003_4000000000004`;
  const picture = (url: string, silhouette: boolean) => ({
    id: COMMENT,
    from: { id: '5000000000005', picture: { data: { url, is_silhouette: silhouette } } },
  });

  it('ảnh thật → trả URL https; chỉ GET, đúng trường, đúng đường dẫn', async () => {
    const url = 'https://scontent.xx.fbcdn.net/v/t1/avatar.jpg?oh=1&oe=2';
    const { connector, calls } = harness([json(picture(url, false))]);
    expect(await connector.fetchCommentAuthorPicture(channel, COMMENT)).toBe(url);
    const [call] = calls as [Call];
    expect(call.init.method).toBe('GET');
    expect(call.url.pathname).toBe(`/v27.0/${COMMENT}`);
    expect(call.url.searchParams.get('fields')).toBe(
      'from{id,picture.type(large){url,is_silhouette}}',
    );
  });

  it('ảnh mặc định (is_silhouette), thiếu from/picture, URL không phải https → null (không bịa ảnh)', async () => {
    const cases = [
      picture('https://scontent.xx.fbcdn.net/v/silhouette.jpg', true),
      { id: COMMENT },
      { id: COMMENT, from: { id: '5000000000005' } },
      picture('http://scontent.xx.fbcdn.net/v/a.jpg', false),
      picture('javascript:alert(1)', false),
    ];
    for (const body of cases) {
      const { connector } = harness([json(body)]);
      expect(await connector.fetchCommentAuthorPicture(channel, COMMENT)).toBeNull();
    }
  });

  it('thân sai hình dạng → UNKNOWN; id sai → không gọi mạng; lỗi quyền (#10/#200) → lỗi dùng chung', async () => {
    const bad = harness([json({ from: 5 })]);
    expect((await failureOf(bad.connector.fetchCommentAuthorPicture(channel, COMMENT))).code).toBe(
      'UNKNOWN',
    );
    const badId = harness([]);
    expect(
      (await failureOf(badId.connector.fetchCommentAuthorPicture(channel, '../x'))).message,
    ).toBe('facebook_invalid_id');
    const denied = harness([json(graphError(10), 400)]);
    expect(
      (await failureOf(denied.connector.fetchCommentAuthorPicture(channel, COMMENT))).code,
    ).toBe('PERMISSION');
  });
});

describe('POST-HYDRATE fetchPost — GET /{post-id}?fields=message,permalink_url,full_picture,created_time', () => {
  const POST = `${PAGE_ID}_3000000000003`;

  it('đọc nội dung, liên kết, ảnh, thời gian đăng; chỉ GET, đúng trường', async () => {
    const { connector, calls } = harness([
      json({
        id: POST,
        message: '  Áo thun mới về\n\nGiá liên hệ  ',
        permalink_url: 'https://www.facebook.com/1000000000001/posts/3000000000003',
        full_picture: 'https://scontent.xx.fbcdn.net/v/t39/abc.jpg?x=1',
        created_time: '2026-11-05T03:00:00+0000',
      }),
    ]);
    const post = await connector.fetchPost(channel, POST);
    expect(post).toEqual({
      message: 'Áo thun mới về\n\nGiá liên hệ',
      permalink: 'https://www.facebook.com/1000000000001/posts/3000000000003',
      mediaUrl: 'https://scontent.xx.fbcdn.net/v/t39/abc.jpg?x=1',
      createdTime: new Date('2026-11-05T03:00:00Z'),
    });
    const [call] = calls as [Call];
    expect(call.init.method).toBe('GET');
    expect(call.url.pathname).toBe(`/v27.0/${POST}`);
    expect(call.url.searchParams.get('fields')).toBe(
      'message,permalink_url,full_picture,created_time',
    );
  });

  it('bài thiếu trường (ảnh không chữ, không ảnh) → trường vắng là null; địa chỉ không phải http(s) bị bỏ', async () => {
    const { connector } = harness([
      json({ id: POST, permalink_url: 'javascript:alert(1)', full_picture: 'ftp://x/y.jpg' }),
    ]);
    expect(await connector.fetchPost(channel, POST)).toEqual({
      message: null,
      permalink: null,
      mediaUrl: null,
      createdTime: null,
    });
  });

  it('thân sai hình dạng → UNKNOWN; id sai → UNKNOWN không gọi mạng; lỗi Graph dùng chung xử lý (token hết hạn)', async () => {
    const bad = harness([json({ message: 5 })]);
    expect((await failureOf(bad.connector.fetchPost(channel, POST))).code).toBe('UNKNOWN');
    const badId = harness([]);
    expect((await failureOf(badId.connector.fetchPost(channel, '../x'))).message).toBe(
      'facebook_invalid_id',
    );
    const expired = harness([json(graphError(190), 400)]);
    expect((await failureOf(expired.connector.fetchPost(channel, POST))).code).toBe(
      'TOKEN_EXPIRED',
    );
  });
});

describe('FR-023 fetchComments — quét cả Page theo bài có hoạt động gần đây (QP1)', () => {
  const since = new Date('2026-11-01T00:00:00Z');

  it('FR-023 đọc feed, chỉ đọc bình luận của bài có updated_time ≥ since, lọc bình luận cũ hơn since', async () => {
    const { connector, calls } = harness([
      json(FEED_PAGE),
      json(POST_COMMENTS_MIXED),
      json(EMPTY_PAGE),
    ]);
    const result = await connector.fetchComments(channel, since);
    expect(result.map((c) => c.externalId)).toEqual([`${PAGE_ID}_3000000000101_4000000000201`]);
    expect(result[0]?.postExternalId).toBe(`${PAGE_ID}_3000000000101`);
    // feed + 2 bài mới (bài thứ 3 cũ hơn since → không đọc bình luận)
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url.pathname).toBe(`/v27.0/${PAGE_ID}/feed`);
    expect(calls[0]?.url.searchParams.get('fields')).toBe('id,updated_time');
    expect(calls[1]?.url.pathname).toBe(`/v27.0/${PAGE_ID}_3000000000101/comments`);
    expect(calls[2]?.url.pathname).toBe(`/v27.0/${PAGE_ID}_3000000000102/comments`);
  });

  it('FR-023 chỉ xét tối đa maxFeedPosts bài mới nhất (trần chi phí rate limit)', async () => {
    const { connector, calls } = harness([json(FEED_PAGE), json(EMPTY_PAGE)], { maxFeedPosts: 1 });
    await connector.fetchComments(channel, since);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url.searchParams.get('limit')).toBe('1');
  });

  it('FR-023 bài có id sai dạng bị bỏ; lỗi Graph chỉ là mã, không lộ token', async () => {
    const { connector } = harness([json(graphError(190), 400)]);
    const error = await failureOf(connector.fetchComments(channel, since));
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it('FR-023 phản hồi feed sai dạng → UNKNOWN facebook_bad_response', async () => {
    const { connector } = harness([json({ nope: true })]);
    const error = await failureOf(connector.fetchComments(channel, since));
    expect(error.message).toBe('facebook_bad_response');
  });

  it('FR-023 maxFeedPosts không hợp lệ bị từ chối khi dựng', () => {
    expect(() => harness([], { maxFeedPosts: 0 })).toThrow();
  });
});

describe('webhook subscription — /{page-id}/subscribed_apps', () => {
  it('getPageSubscription: tìm ứng dụng của mình, trả danh sách trường đã đăng ký', async () => {
    const { connector, calls } = harness([json(SUBSCRIBED_APPS)]);
    expect(await connector.getPageSubscription(channel)).toEqual({
      subscribed: true,
      fields: ['feed'],
    });
    const [call] = calls as [Call];
    expect(call.init.method).toBe('GET');
    expect(call.url.pathname).toBe(`/v27.0/${PAGE_ID}/subscribed_apps`);
    expect(call.url.searchParams.get('access_token')).toBe(TOKEN);
  });

  it('chưa đăng ký / chỉ ứng dụng khác → subscribed=false', async () => {
    for (const body of [
      SUBSCRIBED_APPS_NONE,
      { data: [{ id: '1', subscribed_fields: ['feed'] }] },
    ]) {
      const { connector } = harness([json(body)]);
      expect(await connector.getPageSubscription(channel)).toEqual({
        subscribed: false,
        fields: [],
      });
    }
  });

  it('subscribePage: POST subscribed_fields=feed (mặc định), success:true → xong', async () => {
    const { connector, calls } = harness([json(SUCCESS_TRUE)]);
    await connector.subscribePage(channel);
    const [call] = calls as [Call];
    expect(call.init.method).toBe('POST');
    expect(call.url.pathname).toBe(`/v27.0/${PAGE_ID}/subscribed_apps`);
    const body = bodyOf(call);
    expect(body.get('subscribed_fields')).toBe('feed');
    expect(body.get('access_token')).toBe(TOKEN);
  });

  it('subscribePage nhận danh sách trường; success:false → UNKNOWN; lỗi 200 → PERMISSION', async () => {
    const ok = harness([json(SUCCESS_TRUE)]);
    await ok.connector.subscribePage(channel, ['feed', 'messages']);
    expect(bodyOf(ok.calls[0] as Call).get('subscribed_fields')).toBe('feed,messages');
    const no = harness([json(SUCCESS_FALSE)]);
    expect((await failureOf(no.connector.subscribePage(channel))).code).toBe('UNKNOWN');
    const perm = harness([json(graphError(200), 403)]);
    expect((await failureOf(perm.connector.subscribePage(channel))).code).toBe('PERMISSION');
  });

  it('checkConnection: token sống → báo webhook đã đăng ký hay chưa; token hỏng → TOKEN_EXPIRED', async () => {
    const ok = harness([json(SUBSCRIBED_APPS)]);
    expect(await ok.connector.checkConnection?.(channel)).toEqual({ webhookSubscribed: true });
    const none = harness([json({ data: [] })]);
    expect(await none.connector.checkConnection?.(channel)).toEqual({ webhookSubscribed: false });
    const expired = harness([json(graphError(190), 401)]);
    expect(
      (await failureOf(Promise.resolve().then(() => expired.connector.checkConnection?.(channel))))
        .code,
    ).toBe('TOKEN_EXPIRED');
  });

  it('thân lạ khi GET → UNKNOWN', async () => {
    const { connector } = harness([json({ data: 5 })]);
    expect((await failureOf(connector.getPageSubscription(channel))).code).toBe('UNKNOWN');
  });
});

describe('webhook — verifyWebhook / parseWebhook', () => {
  const raw = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
  const request = (signature?: string) =>
    new Request('https://example.test/webhook', {
      method: 'POST',
      body: raw,
      headers: signature === undefined ? {} : { 'x-hub-signature-256': signature },
    });

  it('chữ ký đúng → true; sai/thiếu → false', async () => {
    const { connector } = harness([]);
    expect(await connector.verifyWebhook(request(signMetaBody(raw, APP_SECRET)))).toBe(true);
    expect(await connector.verifyWebhook(request(signMetaBody(raw, 'khóa khác')))).toBe(false);
    expect(await connector.verifyWebhook(request())).toBe(false);
  });

  it('parseWebhook chuẩn hóa sự kiện bình luận (dùng parseMetaWebhook)', () => {
    const { connector } = harness([]);
    expect(connector.parseWebhook({ object: 'page', entry: [] })).toEqual([]);
    expect(connector.parseWebhook('rác')).toEqual([]);
  });
});

describe('kiểm id trước khi ghép đường dẫn — id sai KHÔNG gọi mạng, mã lỗi không chứa id', () => {
  const bad = [
    '',
    '.',
    '..',
    '../x',
    '1/../me',
    '1?x=1',
    'abc',
    '12 34',
    '1_2_3_4',
    '１２３',
    '-1',
    '1#',
    ' ',
  ];

  it.each(bad)('id %j bị từ chối ở mọi thao tác dùng id', async (id) => {
    const { connector, fetchFake } = harness([]);
    const tryAll: Array<Promise<unknown>> = [
      connector.reply(channel, id, 'x'),
      connector.setHidden(channel, id, true),
      connector.fetchReplies(channel, id),
      connector.fetchPostComments(channel, id),
      connector.fetchPost(channel, id),
      connector.getTokenPermissions({ ...channel, externalId: id }),
      connector.getPageSubscription({ ...channel, externalId: id }),
      connector.subscribePage({ ...channel, externalId: id }),
    ];
    for (const promise of tryAll) {
      const error = await failureOf(promise);
      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('facebook_invalid_id');
      if (id.trim().length > 0) expect(JSON.stringify(error)).not.toContain(id);
    }
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it('id đúng định dạng thật (Page, bài pageId_postId, bình luận postId_commentId) được chấp nhận', async () => {
    const { connector } = harness([json(SUCCESS_TRUE), json(SUCCESS_TRUE), json(SUCCESS_TRUE)]);
    await connector.setHidden(channel, '123', true);
    await connector.setHidden(channel, '1000000000001_3000000000003', true);
    await connector.setHidden(channel, '1000000000001_3000000000003_4000000000004', true);
  });

  it('không gọi provider token khi id sai (không đọc token vô ích)', async () => {
    const getAccessToken = vi.fn(async () => TOKEN);
    const { connector } = harness([], { tokenProvider: { getAccessToken } });
    await failureOf(connector.reply(channel, '../x', 'a'));
    expect(getAccessToken).not.toHaveBeenCalled();
  });
});

describe('giới hạn kích thước thân phản hồi', () => {
  const big = () => new Response('x'.repeat(MAX_RESPONSE_BYTES + 1), { status: 200 });

  it('thân vượt giới hạn (không có Content-Length) → facebook_bad_response', async () => {
    const { connector } = harness([big]);
    const error = await failureOf(connector.reply(channel, '4000000000001', 'a'));
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('facebook_bad_response');
  });

  it('Content-Length khai báo quá lớn → từ chối ngay', async () => {
    const { connector } = harness([
      new Response('{}', {
        status: 200,
        headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) },
      }),
    ]);
    expect((await failureOf(connector.setHidden(channel, '4000000000001', true))).message).toBe(
      'facebook_bad_response',
    );
  });

  it('thân nhỏ đọc được; không có body → UNKNOWN', async () => {
    const ok = JSON.stringify({ data: [], pad: 'x'.repeat(1000) });
    const { connector } = harness([new Response(ok, { status: 200 })]);
    expect(await connector.fetchReplies(channel, '3000000000003_4000000000001')).toEqual([]);
    const empty = harness([new Response(null, { status: 200 })]);
    expect((await failureOf(empty.connector.setHidden(channel, '4000000000001', true))).code).toBe(
      'UNKNOWN',
    );
  });
});

describe('tổng thời hạn cho thao tác nhiều trang', () => {
  it('tổng kiểm trước (45 s) + reply (30 s) < thuê 90 s của job send', () => {
    expect(DEFAULT_TOTAL_TIMEOUT_MS + DEFAULT_TIMEOUT_MS).toBeLessThan(90_000);
  });

  it('cấu hình totalTimeoutMs > 45 s hoặc không dương bị từ chối', () => {
    const base = {
      tokenProvider: { getAccessToken: async () => TOKEN },
      appId: APP_ID,
      appSecret: APP_SECRET,
    };
    expect(() => createFacebookConnector({ ...base, totalTimeoutMs: 45_001 })).toThrow();
    expect(() => createFacebookConnector({ ...base, totalTimeoutMs: 0 })).toThrow();
    expect(() => createFacebookConnector({ ...base, maxReplyPages: 0 })).toThrow();
    expect(() => createFacebookConnector({ ...base, maxPages: 0 })).toThrow();
    expect(() => createFacebookConnector({ ...base, totalTimeoutMs: 45_000 })).not.toThrow();
  });

  it('nhiều trang CHẬM: từng trang còn trong hạn nhưng tổng vượt → UNKNOWN, dừng sớm', async () => {
    const slowPage = (_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(json({ data: [], paging: { cursors: { after: 'A' }, next: 'https://x' } })),
          30,
        );
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(init.signal?.reason);
        });
      });
    const fetchSpy = vi.fn(slowPage);
    const connector = createFacebookConnector({
      tokenProvider: { getAccessToken: async () => TOKEN },
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: fetchSpy as unknown as typeof fetch,
      timeoutMs: 1_000,
      maxReplyPages: 50,
    });
    const started = Date.now();
    const error = await failureOf(
      connector.fetchReplies(channel, '3000000000003_4000000000001', { totalTimeoutMs: 80 }),
    );
    expect(error.code).toBe('UNKNOWN');
    expect(Date.now() - started).toBeLessThan(500);
    expect(fetchSpy.mock.calls.length).toBeLessThan(10);
  });

  it('fetchReplies mặc định giới hạn 5 trang (nhỏ hơn fetchPostComments 20 trang)', async () => {
    const endless = () =>
      json({ data: [], paging: { cursors: { after: 'A' }, next: 'https://x' } });
    const replies = harness(Array.from({ length: 30 }, () => endless));
    const error = await failureOf(
      replies.connector.fetchReplies(channel, '3000000000003_4000000000001'),
    );
    expect(error.message).toBe('facebook_too_many_pages');
    expect(replies.fetchFake).toHaveBeenCalledTimes(5);
    const posts = harness(Array.from({ length: 30 }, () => endless));
    await failureOf(posts.connector.fetchPostComments(channel, '3000000000003'));
    expect(posts.fetchFake).toHaveBeenCalledTimes(20);
  });
});

describe('không đối tượng lỗi nào chứa token / proof / URL (kể cả bước GET đặt token trong query)', () => {
  const proof = proofOf(TOKEN);
  const leak = `https://graph.facebook.com/v27.0/x?access_token=${TOKEN}&appsecret_proof=${proof}`;
  const reply = '3000000000003_4000000000001';
  type Connector = ReturnType<typeof harness>['connector'];
  const scenarios: Array<[string, (c: Connector) => Promise<unknown>, () => Reply]> = [
    [
      'GET mạng lỗi chứa URL',
      (c) => c.fetchReplies(channel, reply),
      () => new TypeError(`fetch failed ${leak}`),
    ],
    [
      'GET 500',
      (c) => c.fetchPostComments(channel, '3000000000003'),
      () => json({ error: { message: leak, code: 2 } }, 500),
    ],
    [
      'GET 190',
      (c) => c.getPageSubscription(channel),
      () => json({ error: { message: leak, code: 190, error_user_msg: leak } }, 400),
    ],
    ['GET 429', (c) => c.fetchReplies(channel, reply), () => new Response(leak, { status: 429 })],
    ['GET thân rác', (c) => c.fetchReplies(channel, reply), () => json({ data: leak })],
    [
      'POST mạng lỗi',
      (c) => c.reply(channel, '4000000000001', 'a'),
      () => new Error(`ECONNRESET ${leak}`),
    ],
    [
      'POST 368',
      (c) => c.setHidden(channel, '4000000000001', true),
      () => json({ error: { message: leak, code: 368 } }, 400),
    ],
  ];

  it.each(scenarios)('%s', async (_name, run, makeReply) => {
    const { connector } = harness([makeReply()]);
    const error = await failureOf(run(connector));
    const own = Object.getOwnPropertyNames(error).map((key) => {
      const value = (error as unknown as Record<string, unknown>)[key];
      return `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`;
    });
    const dump = [error.message, error.stack ?? '', String(error.cause), ...own].join('\n');
    for (const secret of [
      TOKEN,
      proof,
      'access_token',
      'appsecret_proof',
      'graph.facebook.com',
      APP_SECRET,
    ]) {
      expect(dump, secret).not.toContain(secret);
    }
    expect(error.cause).toBeUndefined();
  });

  it('khóa hành vi: GET đặt token trong query (theo tài liệu); POST thì KHÔNG', async () => {
    const get = harness([json(EMPTY_PAGE)]);
    await get.connector.fetchReplies(channel, reply);
    expect((get.calls[0] as Call).url.searchParams.get('access_token')).toBe(TOKEN);
    expect((get.calls[0] as Call).init.body).toBeUndefined();
    const post = harness([json(SUCCESS_TRUE)]);
    await post.connector.setHidden(channel, '4000000000001', true);
    expect((post.calls[0] as Call).url.search).toBe('');
  });
});

describe('FR-143 tệp đính kèm của bình luận qua Graph', () => {
  it('FR-143 yêu cầu trường attachment và chuẩn hóa photo/sticker; loại share bị bỏ', async () => {
    const parent = '3000000000003_4000000000001';
    const base = { created_time: '2026-11-05T03:00:00+0000', from: { id: '5000000000005' } };
    const { connector, calls } = harness([
      json({
        data: [
          {
            ...base,
            id: '3000000000003_4000000000020',
            message: 'mẫu này',
            attachment: {
              type: 'photo',
              url: 'https://l.invalid/p',
              media: { image: { src: 'https://scontent.example.invalid/a.jpg' } },
              target: { id: '77' },
            },
          },
          { ...base, id: '3000000000003_4000000000021', attachment: { type: 'sticker' } },
          {
            ...base,
            id: '3000000000003_4000000000022',
            attachment: { type: 'share', url: 'https://l.invalid/x' },
          },
        ],
      }),
    ]);
    const comments = await connector.fetchReplies(channel, parent);
    expect(comments[0]?.attachments).toEqual([
      { type: 'photo', url: 'https://scontent.example.invalid/a.jpg', externalId: '77' },
    ]);
    expect(comments[1]?.attachments).toEqual([{ type: 'sticker' }]);
    expect(comments[2]?.attachments).toBeUndefined();
    expect(calls[0]?.url.searchParams.get('fields')).toContain('attachment');
  });
});

describe('COMPOSER-MEDIA publishPost — ảnh và video', () => {
  const file = (name: string, type: string) => ({
    bytes: Uint8Array.from([1, 2, 3, 4]),
    contentType: type,
    filename: name,
  });
  const formOf = (call: Call) => call.init.body as FormData;

  it('ảnh: tải từng ảnh lên Page ở trạng thái CHƯA đăng (multipart), rồi đăng feed kèm attached_media theo thứ tự', async () => {
    const { connector, calls } = harness([
      json({ id: 'photo1' }),
      json({ id: 'photo2' }),
      json({ id: `${PAGE_ID}_77` }),
    ]);
    const result = await connector.publishPost(channel, 'Hàng mới', {
      kind: 'image',
      files: [file('a.jpg', 'image/jpeg'), file('b.png', 'image/png')],
    });
    expect(result).toEqual({ externalId: `${PAGE_ID}_77` });
    expect(calls).toHaveLength(3);
    const [p1, p2, feed] = calls as [Call, Call, Call];
    for (const c of [p1, p2]) {
      expect(c.url.pathname).toBe(`/v27.0/${PAGE_ID}/photos`);
      expect(c.url.search).toBe('');
      const form = formOf(c);
      expect(form.get('published')).toBe('false');
      expect(form.get('access_token')).toBe(TOKEN);
      expect(form.get('appsecret_proof')).toBe(proofOf(TOKEN));
      expect(form.get('source')).toBeInstanceOf(Blob);
    }
    expect((formOf(p1).get('source') as File).name).toBe('a.jpg');
    expect(feed.url.pathname).toBe(`/v27.0/${PAGE_ID}/feed`);
    const body = bodyOf(feed);
    expect(body.get('message')).toBe('Hàng mới');
    expect(body.get('attached_media[0]')).toBe('{"media_fbid":"photo1"}');
    expect(body.get('attached_media[1]')).toBe('{"media_fbid":"photo2"}');
  });

  it('ảnh: lỗi tải ảnh (mạng/phản hồi lạ) → lỗi "chắc chắn chưa đăng" và KHÔNG gọi feed; lỗi quyền/token/tốc độ giữ nguyên mã', async () => {
    const bad = harness([json({ nope: 1 })]);
    const failure = await failureOf(
      bad.connector.publishPost(channel, 'x', {
        kind: 'image',
        files: [file('a.jpg', 'image/jpeg')],
      }),
    );
    expect(failure.message).toBe('facebook_media_upload_failed');
    expect(bad.calls).toHaveLength(1);
    const perm = harness([json(graphError(200), 403)]);
    expect(
      (
        await failureOf(
          perm.connector.publishPost(channel, 'x', {
            kind: 'image',
            files: [file('a.jpg', 'image/jpeg')],
          }),
        )
      ).code,
    ).toBe('PERMISSION');
  });

  it('ảnh: danh sách rỗng hoặc quá 10 ảnh → từ chối trước khi gọi mạng', async () => {
    for (const files of [[], Array.from({ length: 11 }, () => file('a.jpg', 'image/jpeg'))]) {
      const { connector, calls } = harness([]);
      expect(
        (await failureOf(connector.publishPost(channel, 'x', { kind: 'image', files }))).message,
      ).toBe('facebook_invalid_post');
      expect(calls).toHaveLength(0);
    }
  });

  it('video: MỘT lệnh /videos với source + description; phản hồi thiếu id → UNKNOWN (không tự thử lại)', async () => {
    const { connector, calls } = harness([json({ id: 'vid1' })]);
    const result = await connector.publishPost(channel, 'Video mới', {
      kind: 'video',
      file: file('v.mp4', 'video/mp4'),
    });
    expect(result).toEqual({ externalId: 'vid1' });
    expect(calls).toHaveLength(1);
    const [call] = calls as [Call];
    expect(call.url.pathname).toBe(`/v27.0/${PAGE_ID}/videos`);
    const form = formOf(call);
    expect(form.get('description')).toBe('Video mới');
    expect((form.get('source') as File).name).toBe('v.mp4');
    const broken = harness([json({})]);
    expect(
      (
        await failureOf(
          broken.connector.publishPost(channel, 'x', {
            kind: 'video',
            file: file('v.mp4', 'video/mp4'),
          }),
        )
      ).code,
    ).toBe('UNKNOWN');
  });
});
