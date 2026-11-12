import { randomUUID } from 'node:crypto';
import { eventHashOf, parseMetaWebhook, serializeEvent } from '@flow/connectors';
import { createDb, type FlowDb, recordWebhookEvent } from '@flow/db';
import pg from 'pg';
import type { Job } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngestHandler, MAX_INGEST_ATTEMPTS } from '../src/jobs/ingest';

/**
 * WH-INGEST (FR-020/021/022): job `ingest` — đọc sự kiện đã ghi, tạo bài + bình luận (idempotent), bỏ bình luận do chính
 * Page viết, không đổi gì với sửa/xóa (chờ FB-HIDE), lỗi → failed/dead (không PII) rồi ném để pg-boss thử lại.
 * FIXTURE mô phỏng webhook `feed` (không phải dữ liệu thật).
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
const quiet = { error: () => {}, info: () => {}, warn: () => {} };

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 4 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop ingest',
    `shop-${ws}`,
  ]);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const handler = () => createIngestHandler({ db, logger: quiet });
const job = (workspaceId: string, eventId: string) => [
  { id: randomUUID(), data: { workspaceId, eventId } } as unknown as Job<unknown>,
];

async function seedPage(options: { status?: string; subscribed?: boolean } = {}) {
  const pageId = `page-${randomUUID()}`;
  const result = await admin.query(
    `INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, webhook_subscribed)
     VALUES ($1, 'facebook', $2, 'Page', $3, $4) RETURNING id`,
    [ws, pageId, options.status ?? 'connected', options.subscribed ?? true],
  );
  return { pageId, channelId: result.rows[0].id as string };
}

const change = (pageId: string, overrides: Record<string, unknown> = {}) => ({
  field: 'feed',
  value: {
    from: { id: `user-${randomUUID()}`, name: 'Khách Thử' },
    message: 'Còn size M không shop?',
    post_id: `${pageId}_post1`,
    comment_id: `post1_${randomUUID()}`,
    created_time: 1_762_000_000,
    item: 'comment',
    parent_id: `${pageId}_post1`,
    verb: 'add',
    ...overrides,
  },
});

/** Ghi sự kiện qua đường thật của route webhook, trả (eventId) của workspace ws. */
async function record(
  pageId: string,
  changeObject: unknown,
  source?: 'polling' | 'backfill' | 'khac',
): Promise<string> {
  const [event] = parseMetaWebhook({
    object: 'page',
    entry: [{ id: pageId, time: 1, changes: [changeObject] }],
  });
  if (!event) throw new Error('fixture không parse được');
  const rows = await db.withSystem((tx) =>
    recordWebhookEvent(tx, {
      platform: 'facebook',
      pageExternalId: pageId,
      eventHash: eventHashOf('facebook', event),
      payload: source ? { ...serializeEvent(event), source } : serializeEvent(event),
    }),
  );
  const row = rows.find((r) => r.workspaceId === ws);
  if (!row) throw new Error('không có dòng cho workspace');
  return row.eventId;
}

const eventRow = async (eventId: string) =>
  (
    await admin.query(
      'SELECT status, attempts, error, processed_at FROM cf.webhook_events WHERE id = $1',
      [eventId],
    )
  ).rows[0];
const commentsOf = async (channelId: string) =>
  (
    await admin.query(
      'SELECT external_id, text, status, is_own, parent_external_id, author_external_id, author_name, post_id FROM cf.comments WHERE channel_id = $1',
      [channelId],
    )
  ).rows;
const postOf = async (channelId: string) =>
  (
    await admin.query(
      'SELECT external_id, comment_count, pending_count FROM cf.posts WHERE channel_id = $1',
      [channelId],
    )
  ).rows;

describe('POST-HYDRATE — gọi hook điền nội dung bài', () => {
  it('chỉ cho bài MỚI tạo (một lần), sau khi lưu xong; bình luận thứ hai cùng bài và lỗi của hook không làm hỏng ingest', async () => {
    const { pageId, channelId } = await seedPage();
    const targets: Array<Record<string, unknown>> = [];
    const hydrate = async (target: Record<string, unknown>) => {
      targets.push(target);
      throw new Error('hook hỏng không được làm hỏng ingest');
    };
    const run = createIngestHandler({ db, logger: quiet, hydrate: hydrate as never });

    const first = await record(pageId, change(pageId));
    await run(job(ws, first));
    expect(targets).toHaveLength(1);
    const post = (await postOf(channelId))[0];
    expect(targets[0]).toMatchObject({
      workspaceId: ws,
      channelId,
      channelExternalId: pageId,
      postExternalId: post?.external_id,
    });
    expect(typeof targets[0]?.postId).toBe('string');
    expect(await commentsOf(channelId)).toHaveLength(1); // bình luận đã lưu dù hook ném

    // Bình luận thứ hai cùng bài → bài đã có → KHÔNG gọi hook nữa.
    const second = await record(pageId, change(pageId));
    await run(job(ws, second));
    expect(targets).toHaveLength(1);
    expect(await commentsOf(channelId)).toHaveLength(2);
    expect((await eventRow(second))?.status).toBe('done');
  });

  it('không có hook → ingest như cũ', async () => {
    const { pageId, channelId } = await seedPage();
    await handler()(job(ws, await record(pageId, change(pageId))));
    expect(await commentsOf(channelId)).toHaveLength(1);
  });
});

describe('FR-021 job ingest — bình luận mới', () => {
  it('tạo bài (nếu chưa có) + bình luận trạng thái new, tăng đếm đúng một lần, sự kiện done', async () => {
    const { pageId, channelId } = await seedPage();
    const c = change(pageId);
    const eventId = await record(pageId, c);
    await handler()(job(ws, eventId));

    const comments = await commentsOf(channelId);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      text: 'Còn size M không shop?',
      status: 'new',
      is_own: false,
      parent_external_id: null,
      author_name: 'Khách Thử',
    });
    expect(await postOf(channelId)).toEqual([
      { external_id: `${pageId}_post1`, comment_count: 1, pending_count: 1 },
    ]);
    const row = await eventRow(eventId);
    expect(row.status).toBe('done');
    expect(row.processed_at).not.toBeNull();
  });

  it('Q-POR1 lưu nguồn bình luận vào comments.ingest_source: webhook (không có source), polling, backfill; giá trị lạ → webhook', async () => {
    const sourceOf = async (channelId: string) =>
      (
        await admin.query('SELECT ingest_source FROM cf.comments WHERE channel_id = $1', [
          channelId,
        ])
      ).rows[0].ingest_source as string;
    for (const [source, expected] of [
      [undefined, 'webhook'],
      ['polling', 'polling'],
      ['backfill', 'backfill'],
      ['khac', 'webhook'],
    ] as const) {
      const { pageId, channelId } = await seedPage();
      const eventId = await record(pageId, change(pageId), source);
      await handler()(job(ws, eventId));
      expect(await sourceOf(channelId)).toBe(expected);
    }
  });

  it('FR-143 lưu loại + link tệp đính kèm; bình luận chữ thuần → []; chữ vẫn lưu', async () => {
    const { pageId, channelId } = await seedPage();
    const img = 'https://scontent.example.invalid/a.jpg';
    await handler()(job(ws, await record(pageId, change(pageId, { photo: img }))));
    await handler()(job(ws, await record(pageId, change(pageId, { message: 'chỉ chữ' }))));
    const rows = (
      await admin.query(
        "SELECT text, attachments FROM cf.comments WHERE channel_id = $1 ORDER BY (attachments = '[]'::jsonb), text",
        [channelId],
      )
    ).rows;
    expect(rows).toEqual([
      { text: 'Còn size M không shop?', attachments: [{ type: 'photo', url: img }] },
      { text: 'chỉ chữ', attachments: [] },
    ]);
  });

  it('chạy lại cùng job / cùng sự kiện → không thêm bình luận, không tăng đếm (idempotent)', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    await handler()(job(ws, eventId));
    await handler()(job(ws, eventId));
    expect(await commentsOf(channelId)).toHaveLength(1);
    expect((await postOf(channelId))[0]).toMatchObject({ comment_count: 1, pending_count: 1 });
  });

  it('cùng bình luận đến từ hai sự kiện khác nhau (hash khác) → một bình luận, đếm một lần', async () => {
    const { pageId, channelId } = await seedPage();
    const same = change(pageId);
    const e1 = await record(pageId, same);
    const e2 = await record(pageId, {
      ...same,
      value: { ...(same.value as object), created_time: 1_762_000_500 },
    });
    await handler()(job(ws, e1));
    await handler()(job(ws, e2));
    expect(await commentsOf(channelId)).toHaveLength(1);
    expect((await postOf(channelId))[0]).toMatchObject({ comment_count: 1 });
  });

  it('nhiều bình luận trên cùng bài → một bài, đếm tăng; trả lời lồng giữ parent_external_id', async () => {
    const { pageId, channelId } = await seedPage();
    const first = change(pageId);
    const reply = change(pageId, { parent_id: (first.value as { comment_id: string }).comment_id });
    await handler()(job(ws, await record(pageId, first)));
    await handler()(job(ws, await record(pageId, reply)));
    const posts = await postOf(channelId);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ comment_count: 2, pending_count: 2 });
    const rows = await commentsOf(channelId);
    expect(rows.map((r) => r.parent_external_id).sort()).toEqual(
      [(first.value as { comment_id: string }).comment_id, null].sort(),
    );
  });
});

describe('FR-022 bỏ bình luận do chính Page viết; sự kiện không xử lý', () => {
  it('from.id == Page → KHÔNG tạo bình luận (kể cả bài), sự kiện done', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId, { from: { id: pageId, name: 'Shop' } }));
    await handler()(job(ws, eventId));
    expect(await commentsOf(channelId)).toHaveLength(0);
    expect(await postOf(channelId)).toHaveLength(0);
    expect((await eventRow(eventId)).status).toBe('done');
  });

  it('kênh đã ngắt/không còn connected sau khi ghi sự kiện → done, bỏ qua (không tạo bình luận)', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    await admin.query("UPDATE cf.channels SET status = 'revoked' WHERE id = $1", [channelId]);
    await handler()(job(ws, eventId));
    expect(await commentsOf(channelId)).toHaveLength(0);
    expect((await eventRow(eventId)).status).toBe('done');
  });

  it('sự kiện đã done / không tồn tại / thuộc workspace khác → bỏ qua, không lỗi, không đổi', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    await handler()(job(ws, eventId));
    await admin.query("UPDATE cf.channels SET status = 'connected' WHERE id = $1", [channelId]);
    const before = await commentsOf(channelId);
    await handler()(job(ws, eventId));
    await expect(handler()(job(ws, randomUUID()))).resolves.toBeUndefined();
    const otherWs = randomUUID();
    await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
      otherWs,
      'Khác',
      `khac-${otherWs}`,
    ]);
    await expect(handler()(job(otherWs, eventId))).resolves.toBeUndefined();
    expect(await commentsOf(channelId)).toEqual(before);
  });
});

describe('FR-020 lỗi xử lý — failed/dead, không PII, để pg-boss thử lại', () => {
  it('payload hỏng → dead ngay (không thử lại vô ích), lỗi là mã không chứa nội dung', async () => {
    const { pageId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    await admin.query(
      'UPDATE cf.webhook_events SET payload = \'{"kind":"comment_created"}\' WHERE id = $1',
      [eventId],
    );
    await expect(handler()(job(ws, eventId))).resolves.toBeUndefined();
    const row = await eventRow(eventId);
    expect(row.status).toBe('dead');
    expect(row.error).toBe('invalid_payload');
  });

  it('lỗi DB khi lưu bình luận → sự kiện failed + attempts tăng + error là tên lỗi, rồi ném lại; không để lại bình luận dở dang; đủ lần tối đa → dead', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    // Ép lỗi ở bước lưu bình luận: text vượt CHECK? không có → dùng trigger tạm của cf_owner.
    await admin.query(
      `CREATE OR REPLACE FUNCTION cf.test_fail_comment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'loi thu nghiem Khách Thử' USING ERRCODE = '23514'; END $$`,
    );
    await admin.query(
      'CREATE TRIGGER test_fail_comment BEFORE INSERT ON cf.comments FOR EACH ROW EXECUTE FUNCTION cf.test_fail_comment()',
    );
    try {
      await expect(handler()(job(ws, eventId))).rejects.toThrow();
      let row = await eventRow(eventId);
      expect(row).toMatchObject({ status: 'failed', attempts: 1 });
      expect(String(row.error)).not.toContain('Khách');
      expect(await commentsOf(channelId)).toHaveLength(0);
      for (let i = 0; i < MAX_INGEST_ATTEMPTS - 1; i++)
        await expect(handler()(job(ws, eventId))).rejects.toThrow();
      row = await eventRow(eventId);
      expect(row).toMatchObject({ status: 'dead', attempts: MAX_INGEST_ATTEMPTS });
    } finally {
      await admin.query('DROP TRIGGER test_fail_comment ON cf.comments');
      await admin.query('DROP FUNCTION cf.test_fail_comment()');
    }
  });

  it('sự kiện failed được xử lý lại thành công khi hết lỗi → done', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    await admin.query(
      "UPDATE cf.webhook_events SET status = 'failed', attempts = 2 WHERE id = $1",
      [eventId],
    );
    await handler()(job(ws, eventId));
    expect((await eventRow(eventId)).status).toBe('done');
    expect(await commentsOf(channelId)).toHaveLength(1);
  });

  it('dữ liệu job sai (thiếu workspaceId/eventId không phải UUID) → AppError VALIDATION_FAILED, không đụng DB', async () => {
    const bad = [{ id: 'j', data: { eventId: randomUUID() } }] as unknown as Job<unknown>[];
    await expect(handler()(bad)).rejects.toThrow(/không hợp lệ/);
  });
});

describe('FR-048 job ingest — khách sửa/xóa bình luận', () => {
  /** Ghi sự kiện sửa/xóa với entry.time riêng (mỗi lần sửa là một sự kiện). */
  async function recordAt(pageId: string, changeObject: unknown, time: number): Promise<string> {
    const [event] = parseMetaWebhook({
      object: 'page',
      entry: [{ id: pageId, time, changes: [changeObject] }],
    });
    if (!event) throw new Error('fixture không parse được');
    const rows = await db.withSystem((tx) =>
      recordWebhookEvent(tx, {
        platform: 'facebook',
        pageExternalId: pageId,
        eventHash: eventHashOf('facebook', event),
        payload: serializeEvent(event),
      }),
    );
    const row = rows.find((r) => r.workspaceId === ws);
    if (!row) throw new Error('không có dòng cho workspace');
    return row.eventId;
  }
  const withVerb = (base: ReturnType<typeof change>, verb: string, message?: string) => ({
    ...base,
    value: { ...(base.value as object), verb, ...(message === undefined ? {} : { message }) },
  });
  const commentRowOf = async (channelId: string) =>
    (
      await admin.query(
        'SELECT id, text, text_normalized, deleted_at FROM cf.comments WHERE channel_id = $1',
        [channelId],
      )
    ).rows[0];
  const logsOf = async (commentId: string) =>
    (
      await admin.query(
        "SELECT action, actor_type, actor_id FROM core.action_logs WHERE target_id = $1 AND action LIKE 'comment.%' ORDER BY created_at",
        [commentId],
      )
    ).rows;

  it('sửa: cập nhật text (text_normalized về NULL), ghi action_logs KHÔNG kèm nội dung; sửa lần hai (entry.time khác) áp dụng; cùng nội dung → không ghi log', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    await handler()(job(ws, await record(pageId, created)));
    await admin.query(
      "UPDATE cf.comments SET text_normalized = 'chuan hoa' WHERE channel_id = $1",
      [channelId],
    );
    const first = await recordAt(pageId, withVerb(created, 'edited', 'Giá bao nhiêu vậy ạ?'), 100);
    await handler()(job(ws, first));
    let row = await commentRowOf(channelId);
    expect(row).toMatchObject({ text: 'Giá bao nhiêu vậy ạ?', text_normalized: null });
    const second = await recordAt(pageId, withVerb(created, 'edited', 'Còn hàng không ạ?'), 200);
    await handler()(job(ws, second));
    expect((await commentRowOf(channelId)).text).toBe('Còn hàng không ạ?');
    const same = await recordAt(pageId, withVerb(created, 'edited', 'Còn hàng không ạ?'), 300);
    await handler()(job(ws, same));
    const logs = await logsOf(row.id);
    expect(logs.map((l) => l.action)).toEqual(['comment.edited', 'comment.edited']);
    expect(logs.every((l) => l.actor_type === 'system' && l.actor_id === null)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('hàng');
    expect((await eventRow(same)).status).toBe('done');
    row = await commentRowOf(channelId);
    expect(row.deleted_at).toBeNull();
  });

  it('sửa bình luận chưa có trong DB / của chính Page / đã xóa → done êm, không tạo mới, không đổi', async () => {
    const { pageId, channelId } = await seedPage();
    const unknown = change(pageId);
    await handler()(job(ws, await recordAt(pageId, withVerb(unknown, 'edited', 'x'), 10)));
    expect(await commentsOf(channelId)).toHaveLength(0);

    const own = change(pageId);
    await handler()(job(ws, await record(pageId, own)));
    await admin.query('UPDATE cf.comments SET is_own = true WHERE channel_id = $1', [channelId]);
    await handler()(
      job(ws, await recordAt(pageId, withVerb(own, 'edited', 'Câu của Page bị sửa'), 11)),
    );
    expect((await commentRowOf(channelId)).text).toBe('Còn size M không shop?');

    await admin.query(
      'UPDATE cf.comments SET is_own = false, deleted_at = now() WHERE channel_id = $1',
      [channelId],
    );
    await handler()(
      job(ws, await recordAt(pageId, withVerb(own, 'edited', 'Sửa sau khi xóa'), 12)),
    );
    expect((await commentRowOf(channelId)).text).toBe('Còn size M không shop?');
  });

  it('xóa: đặt deleted_at MỘT lần (chạy lại/xóa lại không đổi giờ), giữ dòng, ghi action_logs comment.deleted; bình luận không tồn tại → done êm', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    await handler()(job(ws, await record(pageId, created)));
    const removed = await recordAt(pageId, withVerb(created, 'remove'), 100);
    await handler()(job(ws, removed));
    await handler()(job(ws, removed)); // chạy lại cùng sự kiện
    const first = await commentRowOf(channelId);
    expect(first.deleted_at).not.toBeNull();
    // FR-048 + COMMENT-PRIVACY-ON-DELETE: nội dung và danh tính khách bị xóa trắng; bản sao ở sự kiện TẠO cũng xóa.
    const redacted = (
      await admin.query(
        'SELECT text, text_normalized, author_name, author_external_id, redacted_at FROM cf.comments WHERE id = $1',
        [first.id],
      )
    ).rows[0];
    expect(redacted).toMatchObject({
      text: '',
      text_normalized: null,
      author_name: null,
      author_external_id: '',
    });
    expect(redacted.redacted_at).not.toBeNull();
    expect((await eventRow(removed)).status).toBe('done');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await handler()(job(ws, await recordAt(pageId, withVerb(created, 'remove'), 200))); // xóa lần hai (sự kiện khác)
    expect(new Date((await commentRowOf(channelId)).deleted_at).getTime()).toBe(
      new Date(first.deleted_at).getTime(),
    );
    expect((await logsOf(first.id)).map((l) => l.action)).toEqual(['comment.deleted']);
    expect((await eventRow(removed)).status).toBe('done');

    const ghost = change(pageId);
    await handler()(job(ws, await recordAt(pageId, withVerb(ghost, 'remove'), 300)));
    expect(await commentsOf(channelId)).toHaveLength(1);
  });

  it('xóa trước → tạo sau: dòng được lưu NGAY ở dạng đã xóa trắng, không tính vào số đếm bài, vẫn không vào inbox; thứ tự ngược lại cho cùng kết quả', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    const removed = await recordAt(pageId, withVerb(created, 'remove'), 100);
    await handler()(job(ws, removed)); // chưa có dòng → ghi dấu xóa
    expect(await commentsOf(channelId)).toHaveLength(0);
    await handler()(job(ws, await record(pageId, created))); // tạo đến sau
    const row = (
      await admin.query(
        'SELECT text, author_name, author_external_id, deleted_at, redacted_at FROM cf.comments WHERE channel_id = $1',
        [channelId],
      )
    ).rows[0];
    expect(row).toMatchObject({ text: '', author_name: null, author_external_id: '' });
    expect(row.deleted_at).not.toBeNull();
    expect(row.redacted_at).not.toBeNull();
    const counts = (
      await admin.query('SELECT comment_count, pending_count FROM cf.posts WHERE channel_id = $1', [
        channelId,
      ])
    ).rows[0];
    expect(counts).toMatchObject({ comment_count: 0, pending_count: 0 });
  });

  it('sửa/xóa vẫn đồng bộ khi kênh hết hạn SAU khi nhận sự kiện (là dữ liệu, không phải gửi)', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    await handler()(job(ws, await record(pageId, created)));
    const edit = await recordAt(pageId, withVerb(created, 'edited', 'Sửa khi kênh hết hạn'), 400);
    const remove = await recordAt(pageId, withVerb(created, 'remove'), 500);
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [channelId]);
    await handler()(job(ws, edit));
    expect((await commentRowOf(channelId)).text).toBe('Sửa khi kênh hết hạn');
    await handler()(job(ws, remove));
    expect((await commentRowOf(channelId)).deleted_at).not.toBeNull();
  });
});

describe('FR-048 thứ tự sửa/xóa: lần sửa CŨ đến muộn không ghi đè lần mới', () => {
  async function recordEdit(
    pageId: string,
    base: ReturnType<typeof change>,
    message: string,
    time: number,
  ) {
    const body = { ...base, value: { ...(base.value as object), verb: 'edited', message } };
    const [event] = parseMetaWebhook({
      object: 'page',
      entry: [{ id: pageId, time, changes: [body] }],
    });
    if (!event) throw new Error('parse');
    const rows = await db.withSystem((tx) =>
      recordWebhookEvent(tx, {
        platform: 'facebook',
        pageExternalId: pageId,
        eventHash: eventHashOf('facebook', event),
        payload: serializeEvent(event),
      }),
    );
    const row = rows.find((r) => r.workspaceId === ws);
    if (!row) throw new Error('không có dòng');
    return row.eventId;
  }

  it('sửa lần 2 chạy trước, sửa lần 1 (cũ hơn) chạy sau (retry) → giữ nội dung lần 2; text_synced_at = thời điểm sự kiện', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    await handler()(job(ws, await record(pageId, created)));
    const older = await recordEdit(pageId, created, 'Bản sửa CŨ', 1_000);
    const newer = await recordEdit(pageId, created, 'Bản sửa MỚI', 2_000);
    await handler()(job(ws, newer));
    await handler()(job(ws, older));
    const row = (
      await admin.query('SELECT text, text_synced_at FROM cf.comments WHERE channel_id = $1', [
        channelId,
      ])
    ).rows[0];
    expect(row.text).toBe('Bản sửa MỚI');
    expect(new Date(row.text_synced_at).getTime()).toBe(2_000_000);
  });

  it('hai lần sửa CÙNG thời điểm nhưng nội dung khác → áp dụng theo thứ tự đến (không bị loại)', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    await handler()(job(ws, await record(pageId, created)));
    await handler()(job(ws, await recordEdit(pageId, created, 'A', 5_000)));
    await handler()(job(ws, await recordEdit(pageId, created, 'B', 5_000)));
    expect(
      (await admin.query('SELECT text FROM cf.comments WHERE channel_id = $1', [channelId])).rows[0]
        .text,
    ).toBe('B');
  });

  it('xóa: deleted_at lấy giờ SỰ KIỆN (entry.time) khi có', async () => {
    const { pageId, channelId } = await seedPage();
    const created = change(pageId);
    await handler()(job(ws, await record(pageId, created)));
    const body = { ...created, value: { ...(created.value as object), verb: 'remove' } };
    const [event] = parseMetaWebhook({
      object: 'page',
      entry: [{ id: pageId, time: 7_000, changes: [body] }],
    });
    if (!event) throw new Error('parse');
    const rows = await db.withSystem((tx) =>
      recordWebhookEvent(tx, {
        platform: 'facebook',
        pageExternalId: pageId,
        eventHash: eventHashOf('facebook', event),
        payload: serializeEvent(event),
      }),
    );
    await handler()(job(ws, rows.find((r) => r.workspaceId === ws)?.eventId as string));
    const row = (
      await admin.query('SELECT deleted_at FROM cf.comments WHERE channel_id = $1', [channelId])
    ).rows[0];
    expect(new Date(row.deleted_at).getTime()).toBe(7_000_000);
  });
});

describe('PIPE-ORCHESTRATOR lát E — ingest xếp job pipeline (một nơi quyết định, Q-POR1)', () => {
  const hooked = (over: { flag?: boolean; allowed?: string[] } = {}) => {
    const sent: Array<{
      commentId: string;
      trigger: string;
      startAfter: number;
      priority: number;
    }> = [];
    const h = createIngestHandler({
      db,
      logger: quiet,
      pipeline: {
        enqueue: async (j, startAfter, priority) => {
          sent.push({ commentId: j.commentId, trigger: j.trigger, startAfter, priority });
        },
        priority: async () => 10,
        // Cờ cf.pipeline.v2 theo workspace (giả lập: bật nếu `flag` và workspace nằm trong `allowed`).
        isEnabled: async (id) => (over.flag ?? true) && (over.allowed ?? [ws]).includes(id),
        mergeWindowSeconds: async () => 30,
      },
    });
    return { sent, h };
  };
  const idOf = async (channelId: string) =>
    (await admin.query('SELECT id FROM cf.comments WHERE channel_id = $1', [channelId])).rows.map(
      (r) => r.id as string,
    );

  it('bình luận webhook MỚI → xếp 1 job auto với startAfter = cửa sổ gộp; chạy lại (đã có) → không xếp thêm', async () => {
    const { pageId, channelId } = await seedPage();
    const eventId = await record(pageId, change(pageId));
    const { sent, h } = hooked();
    await h(job(ws, eventId));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ trigger: 'auto', startAfter: 30, priority: 10 });
    expect(await idOf(channelId)).toContain(sent[0]?.commentId);
    await h(job(ws, eventId));
    expect(sent).toHaveLength(1);
  });

  it('backfill, cờ tắt, workspace ngoài danh sách → KHÔNG xếp; bình luận vẫn được lưu `new`', async () => {
    const a = await seedPage();
    const backfill = await record(a.pageId, change(a.pageId), 'backfill');
    const x = hooked();
    await x.h(job(ws, backfill));
    expect(x.sent).toHaveLength(0);
    expect(await commentsOf(a.channelId)).toHaveLength(1);

    const b = await seedPage();
    const ev = await record(b.pageId, change(b.pageId));
    const off = hooked({ flag: false });
    await off.h(job(ws, ev));
    expect(off.sent).toHaveLength(0);

    const c = await seedPage();
    const ev2 = await record(c.pageId, change(c.pageId));
    const other = hooked({ allowed: [randomUUID()] });
    await other.h(job(ws, ev2));
    expect(other.sent).toHaveLength(0);
  });

  it('bình luận do chính Page viết → không lưu, không xếp job', async () => {
    const { pageId } = await seedPage();
    const ev = await record(pageId, change(pageId, { from: { id: pageId, name: 'Page' } }));
    const { sent, h } = hooked();
    await h(job(ws, ev));
    expect(sent).toHaveLength(0);
  });

  it('xếp job lỗi KHÔNG làm hỏng ingest (bình luận đã lưu, sự kiện done; job quét sẽ nhặt lại)', async () => {
    const { pageId, channelId } = await seedPage();
    const ev = await record(pageId, change(pageId));
    const h = createIngestHandler({
      db,
      logger: quiet,
      pipeline: {
        enqueue: async () => {
          throw new Error('boss down');
        },
        isEnabled: async () => true,
        mergeWindowSeconds: async () => 30,
      },
    });
    await h(job(ws, ev));
    expect((await eventRow(ev)).status).toBe('done');
    expect(await commentsOf(channelId)).toHaveLength(1);
  });
});
