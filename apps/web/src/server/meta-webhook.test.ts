import { signMetaBody } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { createMetaWebhookHandlers, MAX_WEBHOOK_BODY_BYTES } from './meta-webhook';

/** FIXTURE mô phỏng webhook `feed` (không phải dữ liệu thật). */
const PAGE = '1000000000001';
const change = (overrides: Record<string, unknown> = {}) => ({
  field: 'feed',
  value: {
    from: { id: '4000000000004', name: 'Khách Thử' },
    message: 'Còn size M không shop?',
    post_id: `${PAGE}_2000000000002`,
    comment_id: '2000000000002_3000000000003',
    created_time: 1_762_000_000,
    item: 'comment',
    parent_id: `${PAGE}_2000000000002`,
    verb: 'add',
    ...overrides,
  },
});
const body = (changes: unknown[]) => ({
  object: 'page',
  entry: [{ id: PAGE, time: 1, changes }],
});

const APP_SECRET = 'bi-mat-app-gia-0123456789abcdef';
const VERIFY_TOKEN = 'verify-token-gia-xyz';

function setup(overrides: Partial<Parameters<typeof createMetaWebhookHandlers>[0]> = {}) {
  const record = vi.fn(async () => [{ eventId: 'e1', workspaceId: 'w1' }]);
  const enqueue = vi.fn(async () => undefined);
  const warn = vi.fn();
  const handlers = createMetaWebhookHandlers({
    appSecret: () => APP_SECRET,
    verifyToken: () => VERIFY_TOKEN,
    record,
    enqueue,
    warn,
    ...overrides,
  });
  return { handlers, record, enqueue, warn };
}

const signed = (payload: unknown, secret = APP_SECRET) => {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  return new Request('http://localhost/api/webhooks/meta', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signMetaBody(raw, secret),
    },
    body: raw,
  });
};

const handshake = (params: Record<string, string>) =>
  new Request(`http://localhost/api/webhooks/meta?${new URLSearchParams(params)}`);

describe('FR-020 GET /api/webhooks/meta — bắt tay đăng ký webhook', () => {
  it('FR-020 đúng mode + verify token → 200 và trả nguyên hub.challenge', async () => {
    const { handlers } = setup();
    const res = await handlers.GET(
      handshake({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('1158201444');
  });

  it('FR-020 sai token / sai mode / thiếu challenge → 403, không lộ token', async () => {
    const { handlers } = setup();
    const bad: Array<Record<string, string>> = [
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'sai', 'hub.challenge': '1' },
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN },
      { 'hub.mode': 'subscribe', 'hub.challenge': '1' },
      {},
    ];
    for (const params of bad) {
      const res = await handlers.GET(handshake(params));
      expect(res.status, JSON.stringify(params)).toBe(403);
      expect(await res.text()).not.toContain(VERIFY_TOKEN);
    }
  });

  it('FR-020 chưa cấu hình META_WEBHOOK_VERIFY_TOKEN → 503 (không bao giờ chấp nhận khi thiếu cấu hình)', async () => {
    const { handlers } = setup({ verifyToken: () => undefined });
    const res = await handlers.GET(
      handshake({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }),
    );
    expect(res.status).toBe(503);
  });
});

describe('FR-020 POST /api/webhooks/meta — chữ ký, ghi sự kiện, enqueue, trả 200', () => {
  it('FR-020 đúng chữ ký → ghi sự kiện, enqueue job ingest cho từng dòng mới, trả 200', async () => {
    const { handlers, record, enqueue } = setup();
    const res = await handlers.POST(signed(body([change()])));
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(1);
    const input = (record.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(input).toMatchObject({ platform: 'facebook', pageExternalId: PAGE });
    expect(input.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(input.payload).toMatchObject({ kind: 'comment_created', channelExternalId: PAGE });
    expect(enqueue).toHaveBeenCalledWith({ eventId: 'e1', workspaceId: 'w1' });
  });

  it('FR-020 thiếu/sai chữ ký → 401, KHÔNG ghi DB, KHÔNG enqueue', async () => {
    const { handlers, record, enqueue } = setup();
    const raw = Buffer.from(JSON.stringify(body([change()])));
    const requests = [
      new Request('http://localhost/api/webhooks/meta', { method: 'POST', body: raw }),
      signed(body([change()]), 'khoa-khac'),
      new Request('http://localhost/api/webhooks/meta', {
        method: 'POST',
        headers: { 'x-hub-signature-256': 'sha256=abc' },
        body: raw,
      }),
    ];
    for (const req of requests) {
      expect((await handlers.POST(req)).status).toBe(401);
    }
    expect(record).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FR-020 sửa thân sau khi ký → 401', async () => {
    const { handlers, record } = setup();
    const raw = Buffer.from(JSON.stringify(body([change()])));
    const req = new Request('http://localhost/api/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signMetaBody(raw, APP_SECRET) },
      body: Buffer.from(JSON.stringify(body([change({ message: 'đã bị sửa' })]))),
    });
    expect((await handlers.POST(req)).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it('FR-020 chưa cấu hình META_APP_SECRET → 503, không ghi gì (kể cả khi chữ ký "đúng" với khóa rỗng)', async () => {
    const { handlers, record } = setup({ appSecret: () => undefined });
    expect((await handlers.POST(signed(body([change()]), ''))).status).toBe(503);
    expect(record).not.toHaveBeenCalled();
  });

  it('FR-020 thân quá lớn → 413 (kiểm Content-Length lẫn thân thật), không ghi gì', async () => {
    const { handlers, record } = setup();
    const huge = Buffer.alloc(MAX_WEBHOOK_BODY_BYTES + 1, 97);
    const noLength = new Request('http://localhost/api/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signMetaBody(huge, APP_SECRET) },
      body: huge,
    });
    expect((await handlers.POST(noLength)).status).toBe(413);
    const claimed = new Request('http://localhost/api/webhooks/meta', {
      method: 'POST',
      headers: { 'content-length': String(MAX_WEBHOOK_BODY_BYTES + 1) },
      body: 'x',
    });
    expect((await handlers.POST(claimed)).status).toBe(413);
    expect(record).not.toHaveBeenCalled();
  });

  it('FR-020 đúng chữ ký nhưng JSON hỏng → 400, không ghi', async () => {
    const { handlers, record } = setup();
    const raw = Buffer.from('{khong-phai-json');
    const req = new Request('http://localhost/api/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signMetaBody(raw, APP_SECRET) },
      body: raw,
    });
    expect((await handlers.POST(req)).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it('FR-020 sự kiện không phải bình luận (reaction, status…) → 200 nhưng không ghi, không enqueue', async () => {
    const { handlers, record, enqueue } = setup();
    const res = await handlers.POST(
      signed(body([change({ item: 'reaction' }), { field: 'mention', value: {} }])),
    );
    expect(res.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FR-021 nhiều bình luận → mỗi bình luận ghi một lần; dòng đã có (gửi lại) → không enqueue', async () => {
    const record = vi
      .fn()
      .mockResolvedValueOnce([
        { eventId: 'e1', workspaceId: 'w1' },
        { eventId: 'e2', workspaceId: 'w2' },
      ])
      .mockResolvedValueOnce([]);
    const { handlers, enqueue } = setup({ record });
    const res = await handlers.POST(signed(body([change(), change({ comment_id: 'c2' })])));
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith({ eventId: 'e2', workspaceId: 'w2' });
  });

  it('FR-020 lỗi DB/queue → 500 (để Meta gửi lại, không nuốt lỗi); log chỉ có tên sự kiện, không payload/chữ ký/khóa', async () => {
    const record = vi.fn(async () => {
      throw new Error(`DB sập ${APP_SECRET} Khách Thử`);
    });
    const { handlers, warn, enqueue } = setup({ record });
    const res = await handlers.POST(signed(body([change()])));
    expect(res.status).toBe(500);
    expect(enqueue).not.toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    for (const secret of [APP_SECRET, 'Khách Thử', 'size M', 'sha256=']) {
      expect(logged).not.toContain(secret);
    }
    expect(warn).toHaveBeenCalled();

    const enqueueFails = vi.fn(async () => {
      throw new Error('queue sập');
    });
    const second = setup({ enqueue: enqueueFails });
    expect((await second.handlers.POST(signed(body([change()])))).status).toBe(500);
  });
});
