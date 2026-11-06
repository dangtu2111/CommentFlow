import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkConnectorContract } from '../contract';
import { PlatformError } from '../errors';
import type { ChannelRef, TokenProvider } from '../types';
import { createTikTokConnector, type TikTokConnectorOptions, tiktokCommentId } from './connector';
import {
  BUSINESS_ID,
  CLIENT_SECRET,
  COMMENT_ID,
  COMMENT_LIST_PAGE_1,
  COMMENT_LIST_PAGE_2,
  REPLY_CREATED,
  REPLY_ID,
  REPLY_LIST,
  TOKEN,
  tiktokError,
  VIDEO_ID,
  VIDEO_LIST,
} from './fixtures';

const channel: ChannelRef = {
  id: 'ch1',
  workspaceId: 'ws1',
  platform: 'tiktok',
  externalId: BUSINESS_ID,
};
const tokenProvider: TokenProvider = { getAccessToken: async () => TOKEN };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function make(responses: Array<Response | Error>, extra: Partial<TikTokConnectorOptions> = {}) {
  const queue = [...responses];
  const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('hết phản hồi mẫu');
    if (next instanceof Error) throw next;
    return next;
  });
  const connector = createTikTokConnector({
    tokenProvider,
    clientSecret: CLIENT_SECRET,
    fetch: fetchMock as unknown as typeof fetch,
    ...extra,
  });
  return { connector, fetchMock };
}

const urlAt = (m: { mock: { calls: unknown[][] } }, i: number): URL => {
  const url = m.mock.calls[i]?.[0];
  if (!(url instanceof URL)) throw new Error(`thiếu lần gọi ${i}`);
  return url;
};

const composite = tiktokCommentId(VIDEO_ID, COMMENT_ID);

describe('FR-015 connector TikTok', () => {
  it('thỏa hợp đồng; khai báo tiktok; KHÔNG có setHidden (chưa có API ẩn chính thức)', () => {
    const { connector } = make([]);
    expect(connector.platform).toBe('tiktok');
    expect(checkConnectorContract(connector)).toEqual([]);
    expect(connector.setHidden).toBeUndefined();
    expect(connector.capabilities.hide.supported).toBe(false);
    expect(connector.capabilities.reply).toMatchObject({ supported: true, maxTextLength: 150 });
  });

  it('reply: POST JSON, token ở header Access-Token (không ở URL), id ghép video:bình luận', async () => {
    const { connector, fetchMock } = make([json(REPLY_CREATED)]);
    await expect(connector.reply(channel, composite, 'Còn nhé')).resolves.toEqual({
      externalId: tiktokCommentId(VIDEO_ID, '7300000000000000199'),
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/open_api/v1.3/business/comment/reply/create/');
    expect(url.search).toBe('');
    expect(url.host).toBe('business-api.tiktok.com');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>)['Access-Token']).toBe(TOKEN);
    expect(JSON.parse(init.body as string)).toEqual({
      business_id: BUSINESS_ID,
      video_id: VIDEO_ID,
      comment_id: COMMENT_ID,
      text: 'Còn nhé',
    });
  });

  it('reply: id sai dạng → UNKNOWN, không gọi mạng; thiếu comment_id trong phản hồi → UNKNOWN', async () => {
    const { connector, fetchMock } = make([json({ code: 0, message: 'OK', data: {} })]);
    await expect(connector.reply(channel, 'khong-hop-le', 'x')).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(connector.reply(channel, composite, 'x')).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('ánh xạ lỗi: code TikTok/HTTP → 5 mã chuẩn, thông điệp không chứa token/nội dung', async () => {
    const cases: Array<[Response, string]> = [
      [json(tiktokError(40105, `token ${TOKEN}`)), 'TOKEN_EXPIRED'],
      [json(tiktokError(40100)), 'RATE_LIMIT'],
      [json({}, 401), 'TOKEN_EXPIRED'],
      [json({}, 403), 'PERMISSION'],
      [json({}, 429, { 'retry-after': '120' }), 'RATE_LIMIT'],
      [json(tiktokError(50000)), 'UNKNOWN'],
      [new Response('<html>', { status: 502 }), 'UNKNOWN'],
    ];
    for (const [response, code] of cases) {
      const { connector } = make([response]);
      const error = await connector.reply(channel, composite, 'x').catch((e) => e);
      expect(error.code).toBe(code);
      expect(error.message).not.toContain(TOKEN);
    }
    const { connector } = make([json({}, 429, { 'retry-after': '120' })]);
    const limited = await connector.reply(channel, composite, 'x').catch((e) => e);
    expect(limited.retryAfterSeconds).toBe(120);
  });

  it('lỗi mạng và token không lấy được → UNKNOWN có mã riêng; mapError chuẩn hóa mọi giá trị', async () => {
    const { connector } = make([new Error(`boom ${TOKEN}`)]);
    const error = await connector.reply(channel, composite, 'x').catch((e) => e);
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('tiktok_network_error');
    const broken = createTikTokConnector({
      tokenProvider: {
        getAccessToken: async () => {
          throw new Error('x');
        },
      },
      clientSecret: CLIENT_SECRET,
    });
    await expect(broken.reply(channel, composite, 'x')).rejects.toMatchObject({
      message: 'tiktok_token_unavailable',
    });
    expect(connector.mapError('lạ').code).toBe('UNKNOWN');
  });

  it('fetchPostComments: đi hết các trang bằng cursor, bỏ thiếu tác giả, giữ của Page (isFromPage), lọc since', async () => {
    const { connector, fetchMock } = make([json(COMMENT_LIST_PAGE_1), json(COMMENT_LIST_PAGE_2)]);
    const since = new Date(1_762_100_000 * 1000);
    const comments = await connector.fetchPostComments(channel, VIDEO_ID, { since });
    const first = urlAt(fetchMock, 0);
    expect(first.pathname).toBe('/open_api/v1.3/business/comment/list/');
    expect(first.searchParams.get('business_id')).toBe(BUSINESS_ID);
    expect(first.searchParams.get('video_id')).toBe(VIDEO_ID);
    expect(first.searchParams.has('cursor')).toBe(false);
    expect(urlAt(fetchMock, 1).searchParams.get('cursor')).toBe('2');
    expect(comments.map((c) => [c.externalId, c.isFromPage])).toEqual([
      [composite, false],
      [tiktokCommentId(VIDEO_ID, '7300000000000000103'), true],
    ]);
    expect(comments[0]).toMatchObject({
      postExternalId: VIDEO_ID,
      parentExternalId: null,
      authorExternalId: 'user-khach-a',
      authorName: 'khach_a',
      createdAt: new Date(1_762_300_500 * 1000),
    });
  });

  it('phân trang lỗi: has_more mà không có cursor → UNKNOWN; quá số trang → UNKNOWN', async () => {
    const stuck = { code: 0, message: 'OK', data: { comments: [], has_more: true } };
    const { connector } = make([json(stuck)]);
    await expect(connector.fetchPostComments(channel, VIDEO_ID)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    const loop = (n: number) => ({
      code: 0,
      message: 'OK',
      data: { comments: [], has_more: true, cursor: n },
    });
    const { connector: c2 } = make([json(loop(1)), json(loop(2)), json(loop(3))], { maxPages: 2 });
    await expect(c2.fetchPostComments(channel, VIDEO_ID)).rejects.toMatchObject({
      message: 'tiktok_too_many_pages',
    });
  });

  it('fetchReplies: đọc trả lời của một bình luận cha, parent = id ghép của cha', async () => {
    const { connector, fetchMock } = make([json(REPLY_LIST)]);
    const replies = await connector.fetchReplies(channel, composite);
    const url = urlAt(fetchMock, 0);
    expect(url.pathname).toBe('/open_api/v1.3/business/comment/reply/list/');
    expect(url.searchParams.get('comment_id')).toBe(COMMENT_ID);
    expect(url.searchParams.get('video_id')).toBe(VIDEO_ID);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      externalId: tiktokCommentId(VIDEO_ID, REPLY_ID),
      parentExternalId: composite,
      postExternalId: VIDEO_ID,
    });
  });

  it('fetchComments: liệt kê video mới nhất rồi đọc bình luận từng video (trần maxFeedPosts)', async () => {
    const { connector, fetchMock } = make([json(VIDEO_LIST), json(COMMENT_LIST_PAGE_2)], {
      maxFeedPosts: 1,
    });
    const comments = await connector.fetchComments(channel, new Date(0));
    expect(urlAt(fetchMock, 0).pathname).toBe('/open_api/v1.3/business/video/list/');
    expect(urlAt(fetchMock, 0).searchParams.get('max_count')).toBe('1');
    expect(urlAt(fetchMock, 1).searchParams.get('video_id')).toBe(VIDEO_ID);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(comments).toHaveLength(1);
  });

  it('tùy chọn sai → ném khi dựng', () => {
    const base = { tokenProvider, clientSecret: CLIENT_SECRET };
    expect(() => createTikTokConnector({ ...base, clientSecret: '' })).toThrow();
    expect(() => createTikTokConnector({ ...base, timeoutMs: 0 })).toThrow();
    expect(() => createTikTokConnector({ ...base, maxPages: 0 })).toThrow();
    expect(() => createTikTokConnector({ ...base, maxFeedPosts: 101 })).toThrow();
    expect(() => createTikTokConnector({ ...base, totalTimeoutMs: 999_999 })).toThrow();
  });

  it('nhánh biên: business id rỗng/quá dài, cursor đứng yên, phản hồi sai dạng, token lỗi chuẩn, maxReplyPages sai', async () => {
    expect(() =>
      createTikTokConnector({ tokenProvider, clientSecret: CLIENT_SECRET, maxReplyPages: 0 }),
    ).toThrow();
    const { connector } = make([]);
    for (const externalId of ['', 'x'.repeat(129)]) {
      await expect(
        connector.fetchPostComments({ ...channel, externalId }, VIDEO_ID),
      ).rejects.toMatchObject({ message: 'tiktok_invalid_id' });
    }
    const same = { code: 0, message: 'OK', data: { comments: [], has_more: true, cursor: 5 } };
    const { connector: c2 } = make([json(same), json(same)]);
    await expect(c2.fetchPostComments(channel, VIDEO_ID)).rejects.toMatchObject({
      message: 'tiktok_bad_response',
    });
    const shapes = [json({ code: 0, message: 'OK', data: { comments: 'x' } }), json('lạ')];
    for (const response of shapes) {
      const { connector: c } = make([response]);
      await expect(c.fetchPostComments(channel, VIDEO_ID)).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    }
    const { connector: c3 } = make([json({ code: 0, message: 'OK', data: { videos: 1 } })]);
    await expect(c3.fetchComments(channel, new Date(0))).rejects.toMatchObject({
      message: 'tiktok_bad_response',
    });
    const mixed = {
      code: 0,
      message: 'OK',
      data: { comments: [{ rac: 1 }], has_more: false },
    };
    const { connector: c4 } = make([json(mixed)]);
    await expect(c4.fetchPostComments(channel, VIDEO_ID)).resolves.toEqual([]);
    const { connector: c5 } = make([
      json({ code: 0, message: 'OK', data: { videos: [{ rac: 1 }] } }),
    ]);
    await expect(c5.fetchComments(channel, new Date(0))).resolves.toEqual([]);
    const expired = createTikTokConnector({
      tokenProvider: {
        getAccessToken: async () => {
          throw new PlatformError('TOKEN_EXPIRED');
        },
      },
      clientSecret: CLIENT_SECRET,
    });
    await expect(expired.reply(channel, composite, 'x')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
    expect(expired.mapError(new PlatformError('BLOCKED')).code).toBe('BLOCKED');
  });

  it('nút tối thiểu: chỉ có owner, không video_id/username/text; trả lời lồng có parent; header chữ ký thừa dấu phẩy', async () => {
    const page = {
      code: 0,
      message: 'OK',
      data: {
        comments: [
          { comment_id: '11', owner: true, create_time: 1_762_300_000 },
          {
            comment_id: '12',
            user_id: 'u',
            owner: false,
            parent_comment_id: '11',
            create_time: 1_762_300_001,
          },
          // Chống vòng lặp/gộp khách: thiếu owner → bỏ; khách không user_id → bỏ; video lạ → bỏ.
          { comment_id: '13', user_id: 'u', create_time: 1_762_300_002 },
          { comment_id: '14', owner: false, create_time: 1_762_300_003 },
          {
            comment_id: '15',
            user_id: 'u',
            owner: false,
            video_id: '999',
            create_time: 1_762_300_004,
          },
        ],
        has_more: false,
      },
    };
    const { connector } = make([json(page)]);
    const got = await connector.fetchPostComments(channel, VIDEO_ID);
    expect(got[0]).toMatchObject({ text: '', authorExternalId: '', isFromPage: true });
    expect(got[0]).not.toHaveProperty('authorName');
    expect(got[1]).toMatchObject({
      parentExternalId: tiktokCommentId(VIDEO_ID, '11'),
      isFromPage: false,
    });
    const r = new Request('https://example.test/h', {
      method: 'POST',
      body: 'x',
      headers: { 'tiktok-signature': ',=,t=1' },
    });
    await expect(connector.verifyWebhook(r)).resolves.toBe(false);
  });

  it('chỉ id hợp lệ mới được ghép vào truy vấn (chống chèn tham số)', async () => {
    const { connector, fetchMock } = make([]);
    await expect(connector.fetchPostComments(channel, '1&x=2')).rejects.toMatchObject({
      message: 'tiktok_invalid_id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('FR-015 TikTok webhook: chữ ký', () => {
  const NOW = new Date('2026-11-06T03:00:00Z');
  const body = JSON.stringify({ event: 'comment.create', note: 'mẫu' });
  const sign = (ts: number, raw = body, secret = CLIENT_SECRET) =>
    createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  const req = (header: string | null, raw = body) =>
    new Request('https://example.test/hook', {
      method: 'POST',
      body: raw,
      headers: header === null ? {} : { 'tiktok-signature': header },
    });
  const ts = Math.floor(NOW.getTime() / 1000);
  async function verify(r: Request): Promise<boolean> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      return await make([]).connector.verifyWebhook(r);
    } finally {
      vi.useRealTimers();
    }
  }

  it('chữ ký đúng, trong 5 phút → hợp lệ; req không bị tiêu thân', async () => {
    const r = req(`t=${ts},s=${sign(ts)}`);
    await expect(verify(r)).resolves.toBe(true);
    await expect(r.text()).resolves.toBe(body);
    await expect(verify(req(`t=${ts - 299},s=${sign(ts - 299)}`))).resolves.toBe(true);
  });

  it('sai chữ ký / sai khóa / thân bị sửa / lệch giờ / thiếu header / sai dạng → từ chối', async () => {
    const bad = [
      req(`t=${ts},s=${'0'.repeat(64)}`),
      req(`t=${ts},s=${sign(ts, body, 'khoa-khac')}`),
      req(`t=${ts},s=${sign(ts)}`, `${body} `),
      req(`t=${ts - 301},s=${sign(ts - 301)}`),
      req(`t=${ts + 301},s=${sign(ts + 301)}`),
      req(null),
      req(`t=abc,s=${sign(ts)}`),
      req(`t=${ts}`),
      req(`t=${ts},s=zz`),
      req(`s=${sign(ts)}`),
    ];
    for (const r of bad) await expect(verify(r)).resolves.toBe(false);
  });

  it('parseWebhook: chưa có sự kiện bình luận chính thức → luôn rỗng (đọc bằng polling)', () => {
    const { connector } = make([]);
    expect(connector.parseWebhook({ event: 'comment.create' })).toEqual([]);
    expect(connector.parseWebhook(null)).toEqual([]);
  });
});
