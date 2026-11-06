import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { checkConnectorContract } from '../contract';
import { isPlatformError } from '../errors';
import { signMetaBody } from '../facebook/webhook';
import type { ChannelRef, TokenProvider } from '../types';
import { createInstagramConnector, type InstagramConnectorOptions } from './connector';
import {
  APP_ID,
  APP_SECRET,
  COMMENT_ID,
  COMMENT_REPLIES,
  graphError,
  IG_ID,
  MEDIA_COMMENTS,
  MEDIA_ID,
  REPLY_CREATED,
  SUCCESS_TRUE,
  TOKEN,
  USER_MEDIA,
  WEBHOOK_COMMENT,
} from './fixtures';

const channel: ChannelRef = {
  id: 'ch1',
  workspaceId: 'ws1',
  platform: 'instagram',
  externalId: IG_ID,
};
const tokenProvider: TokenProvider = { getAccessToken: async () => TOKEN };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** URL của lần gọi thứ `index` (ném nếu không có — test lỗi rõ thay vì `undefined`). */
function urlAt(fetchMock: { mock: { calls: unknown[][] } }, index: number): URL {
  const url = fetchMock.mock.calls[index]?.[0];
  if (!(url instanceof URL)) throw new Error(`thiếu lần gọi ${index}`);
  return url;
}

function make(responses: Array<Response | Error>, extra: Partial<InstagramConnectorOptions> = {}) {
  const queue = [...responses];
  const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('hết phản hồi mẫu');
    if (next instanceof Error) throw next;
    return next;
  });
  const connector = createInstagramConnector({
    tokenProvider,
    appId: APP_ID,
    appSecret: APP_SECRET,
    fetch: fetchMock as unknown as typeof fetch,
    ...extra,
  });
  return { connector, fetchMock };
}

describe('FR-013 connector Instagram', () => {
  it('thỏa hợp đồng connector và khai báo instagram', () => {
    const { connector } = make([]);
    expect(connector.platform).toBe('instagram');
    expect(checkConnectorContract(connector)).toEqual([]);
    expect(connector.capabilities.hide.supported).toBe(true);
    expect(connector.capabilities.sendMessage.supported).toBe(false);
  });

  it('reply: POST /{comment}/replies, token + appsecret_proof trong THÂN (không nằm trong URL)', async () => {
    const { connector, fetchMock } = make([json(REPLY_CREATED)]);
    await expect(connector.reply(channel, COMMENT_ID, 'Còn nhé')).resolves.toEqual({
      externalId: REPLY_CREATED.id,
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(`/v27.0/${COMMENT_ID}/replies`);
    expect(url.search).toBe('');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const body = init.body as URLSearchParams;
    expect(body.get('message')).toBe('Còn nhé');
    expect(body.get('access_token')).toBe(TOKEN);
    expect(body.get('appsecret_proof')).toBe(
      createHmac('sha256', APP_SECRET).update(TOKEN).digest('hex'),
    );
  });

  it('reply: 2xx không có id → UNKNOWN (có thể đã đăng, job sẽ kiểm trước khi gửi lại)', async () => {
    const { connector } = make([json({})]);
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('setHidden: hide=true/false trên /{comment}; success khác true → UNKNOWN', async () => {
    const { connector, fetchMock } = make([
      json(SUCCESS_TRUE),
      json(SUCCESS_TRUE),
      json({ success: false }),
    ]);
    await connector.setHidden?.(channel, COMMENT_ID, true);
    await connector.setHidden?.(channel, COMMENT_ID, false);
    const hides = fetchMock.mock.calls.map((c) =>
      new URLSearchParams(String((c[1] as RequestInit).body)).get('hide'),
    );
    expect(hides).toEqual(['true', 'false']);
    expect(urlAt(fetchMock, 0).pathname).toBe(`/v27.0/${COMMENT_ID}`);
    await expect(connector.setHidden?.(channel, COMMENT_ID, true)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('fetchReplies: đọc /{comment}/replies, đánh dấu isFromPage và cha', async () => {
    const { connector, fetchMock } = make([json(COMMENT_REPLIES)]);
    const replies = await connector.fetchReplies?.(channel, COMMENT_ID, {
      postExternalId: MEDIA_ID,
    });
    expect(replies).toHaveLength(1);
    expect(replies?.[0]).toMatchObject({
      parentExternalId: COMMENT_ID,
      postExternalId: MEDIA_ID,
      isFromPage: true,
      text: 'Còn nhé bạn',
    });
    expect(urlAt(fetchMock, 0).pathname).toBe(`/v27.0/${COMMENT_ID}/replies`);
  });

  it('fetchReplies: đi hết các trang bằng con trỏ after (không theo URL next); hết hạn mức → lỗi', async () => {
    const page1 = {
      ...COMMENT_REPLIES,
      paging: { cursors: { after: 'c2' }, next: 'https://evil.example/x' },
    };
    const { connector, fetchMock } = make([json(page1), json(COMMENT_REPLIES)]);
    expect(await connector.fetchReplies?.(channel, COMMENT_ID)).toHaveLength(2);
    expect(urlAt(fetchMock, 1).searchParams.get('after')).toBe('c2');
    expect(urlAt(fetchMock, 1).host).toBe('graph.facebook.com');

    const endless = { ...COMMENT_REPLIES, paging: { cursors: { after: 'c' }, next: 'n' } };
    const { connector: c2 } = make([json(endless), json(endless)], { maxReplyPages: 2 });
    await expect(c2.fetchReplies?.(channel, COMMENT_ID)).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'instagram_too_many_pages',
    });
  });

  it('fetchPostComments: lọc since phía mình; bản ghi hỏng bị bỏ', async () => {
    const withJunk = {
      data: [...MEDIA_COMMENTS.data, { nope: 1 }, { id: 'x', timestamp: 'hỏng' }],
    };
    const { connector } = make([json(withJunk)]);
    const got = await connector.fetchPostComments(channel, MEDIA_ID, {
      since: new Date('2026-11-04T00:00:00Z'),
    });
    expect(got.map((c) => c.externalId)).toEqual([COMMENT_ID]);
    expect(got[0]).toMatchObject({
      authorName: 'khach_a',
      parentExternalId: null,
      isFromPage: false,
    });
  });

  it('fetchComments: quét maxFeedPosts media mới nhất (media cũ vẫn có thể có bình luận mới), lọc since ở bình luận', async () => {
    const { connector, fetchMock } = make([
      json(USER_MEDIA),
      json(MEDIA_COMMENTS),
      json({ data: [] }),
    ]);
    const got = await connector.fetchComments(channel, new Date('2026-11-03T00:00:00Z'));
    expect(got.map((c) => c.externalId)).toEqual([COMMENT_ID]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlAt(fetchMock, 0).pathname).toBe(`/v27.0/${IG_ID}/media`);
    expect(urlAt(fetchMock, 1).pathname).toBe(`/v27.0/${MEDIA_ID}/comments`);
  });

  it('mapError theo mã Graph: 190→TOKEN_EXPIRED, 10/200→PERMISSION, 4/17/80002→RATE_LIMIT, 368→BLOCKED', async () => {
    const expected: Array<[number, string]> = [
      [190, 'TOKEN_EXPIRED'],
      [10, 'PERMISSION'],
      [200, 'PERMISSION'],
      [4, 'RATE_LIMIT'],
      [17, 'RATE_LIMIT'],
      [80002, 'RATE_LIMIT'],
      [368, 'BLOCKED'],
      [100, 'UNKNOWN'],
    ];
    for (const [graphCode, code] of expected) {
      const { connector } = make([json(graphError(graphCode), 400)]);
      await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
        code,
        message: `instagram_error_${graphCode}`,
      });
    }
  });

  it('RATE_LIMIT mang retryAfterSeconds từ X-Business-Use-Case-Usage; HTTP 429 không có thân vẫn RATE_LIMIT', async () => {
    const usage = JSON.stringify({ [IG_ID]: [{ estimated_time_to_regain_access: 2 }] });
    const { connector } = make([
      json(graphError(80002), 400, { 'x-business-use-case-usage': usage }),
      json({}, 429),
    ]);
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      retryAfterSeconds: 120,
    });
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      message: 'instagram_http_429',
    });
  });

  it('lỗi mạng / lỗi kèm HTTP 200 / token không lấy được: chỉ ra mã, không lộ token hay URL', async () => {
    const { connector } = make([new Error(`boom ${TOKEN}`), json(graphError(190), 200)]);
    const net = await connector.reply(channel, COMMENT_ID, 'x').catch((e: unknown) => e);
    expect(isPlatformError(net) && net.code).toBe('UNKNOWN');
    expect(JSON.stringify(net)).not.toContain(TOKEN);
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
    const broken = createInstagramConnector({
      tokenProvider: { getAccessToken: async () => Promise.reject(new Error(TOKEN)) },
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: vi.fn() as unknown as typeof fetch,
    });
    const err = await broken.reply(channel, COMMENT_ID, 'x').catch((e: unknown) => e);
    expect(isPlatformError(err) && err.message).toBe('instagram_token_unavailable');
  });

  it('id sai dạng bị chặn TRƯỚC khi gọi mạng', async () => {
    const { connector, fetchMock } = make([]);
    for (const bad of ['', '../me', `${COMMENT_ID}?x=1`, 'abc']) {
      await expect(connector.reply(channel, bad, 'x')).rejects.toMatchObject({
        message: 'instagram_invalid_id',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifyWebhook: chữ ký đúng → true; sai/thiếu → false; parseWebhook chuẩn hóa field comments', async () => {
    const { connector } = make([]);
    const raw = Buffer.from(JSON.stringify(WEBHOOK_COMMENT));
    const req = (sig?: string) =>
      new Request('https://x.test/hook', {
        method: 'POST',
        body: raw,
        headers: sig ? { 'x-hub-signature-256': sig } : {},
      });
    expect(await connector.verifyWebhook(req(signMetaBody(raw, APP_SECRET)))).toBe(true);
    expect(await connector.verifyWebhook(req(signMetaBody(raw, 'khac')))).toBe(false);
    expect(await connector.verifyWebhook(req())).toBe(false);
    expect(connector.parseWebhook(WEBHOOK_COMMENT)).toHaveLength(1);
  });

  it('mapError: giữ PlatformError, còn lại UNKNOWN', async () => {
    const { connector } = make([]);
    expect(connector.mapError('x').code).toBe('UNKNOWN');
    expect(connector.mapError({ code: 190 }).code).toBe('UNKNOWN');
  });

  it('kiểm tra tùy chọn khi dựng', () => {
    const base = { tokenProvider, appId: APP_ID, appSecret: APP_SECRET };
    expect(() => createInstagramConnector({ ...base, appSecret: '' })).toThrow();
    expect(() => createInstagramConnector({ ...base, appId: '' })).toThrow();
    expect(() => createInstagramConnector({ ...base, apiVersion: '27' })).toThrow();
    expect(() => createInstagramConnector({ ...base, timeoutMs: 90_000 })).toThrow();
    expect(() => createInstagramConnector({ ...base, maxPages: 0 })).toThrow();
    expect(() => createInstagramConnector({ ...base, maxFeedPosts: 101 })).toThrow();
    expect(() => createInstagramConnector({ ...base, maxReplyPages: 0 })).toThrow();
    expect(() => createInstagramConnector({ ...base, totalTimeoutMs: 60_000 })).toThrow();
  });

  it('HTTP 5xx thân không phải JSON → UNKNOWN instagram_http_<status>; 2xx thân không phải JSON → bad_response', async () => {
    const { connector } = make([
      new Response('<html>', { status: 502 }),
      new Response('<html>', { status: 200 }),
    ]);
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'instagram_http_502',
    });
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      message: 'instagram_bad_response',
    });
  });

  it('phản hồi sai cấu trúc / có next mà thiếu con trỏ / thân quá lớn → UNKNOWN instagram_bad_response', async () => {
    const { connector } = make([
      json({ data: 'x' }),
      json({ ...COMMENT_REPLIES, paging: { next: 'n' } }),
      json({ data: 'x' }),
      new Response('{}', { headers: { 'content-length': String(10 * 1024 * 1024) } }),
    ]);
    await expect(connector.fetchReplies(channel, COMMENT_ID)).rejects.toMatchObject({
      message: 'instagram_bad_response',
    });
    await expect(connector.fetchReplies(channel, COMMENT_ID)).rejects.toMatchObject({
      message: 'instagram_bad_response',
    });
    await expect(connector.fetchComments(channel, new Date(0))).rejects.toMatchObject({
      message: 'instagram_bad_response',
    });
    await expect(connector.reply(channel, COMMENT_ID, 'x')).rejects.toMatchObject({
      message: 'instagram_bad_response',
    });
  });

  it('fetchComments bỏ media thiếu id/sai dạng id', async () => {
    const { connector, fetchMock } = make([
      json({ data: [{}, { id: 'abc' }, { id: MEDIA_ID }] }),
      json({ data: [] }),
    ]);
    expect(await connector.fetchComments(channel, new Date(0))).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mapError giữ nguyên PlatformError đã có', async () => {
    const { connector } = make([json(graphError(190), 400)]);
    const error = await connector.reply(channel, COMMENT_ID, 'x').catch((e: unknown) => e);
    expect(connector.mapError(error)).toBe(error);
  });

  it('bình luận Graph thiếu `from` bị BỎ (không khẳng định được có phải của chính mình — chống vòng lặp)', async () => {
    const noFrom = { data: [{ id: COMMENT_ID, text: 'x', timestamp: '2026-11-05T03:00:00+0000' }] };
    const { connector } = make([json(noFrom)]);
    expect(await connector.fetchPostComments(channel, MEDIA_ID)).toEqual([]);
  });

  it('bình luận có parent_id → trả về cha; không có username → không có authorName', async () => {
    const page = {
      data: [
        {
          id: COMMENT_ID,
          timestamp: '2026-11-05T03:00:00+0000',
          from: { id: '17841411111111111' },
          parent_id: '17800000000000777',
        },
      ],
    };
    const { connector } = make([json(page)]);
    const [comment] = await connector.fetchPostComments(channel, MEDIA_ID);
    expect(comment).toMatchObject({ parentExternalId: '17800000000000777', text: '' });
    expect(comment).not.toHaveProperty('authorName');
  });
});
