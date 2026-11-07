import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import { markCommentDeleted } from '../src/comment-redact';
import { purgeExpiredWebhookPayloads } from '../src/retention';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * COMMENT-DELETE-BEFORE-CREATE + WEBHOOK-PAYLOAD-RETENTION (FR-048): dấu xóa khi sự kiện xóa đến trước sự kiện tạo; dòng
 * tạo sau được lưu NGAY ở dạng đã xóa trắng. Job dọn payload webhook sau 14 ngày.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;
let channel: string;
let post: string;

const code = (error: unknown) => {
  const e = error as { cause?: { code?: string }; code?: string };
  return e.cause?.code ?? e.code ?? 'unknown';
};
const asSystem = <T>(fn: (tx: Database) => Promise<T>) => db.withJob(ws, fn);
const insertComment = (ext: string, extra = '') =>
  admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, text_normalized, attachments, created_time, status)
     VALUES ('webhook', $1, $2, $3, $4, 'fb-user', 'Khách', 'Giá bao nhiêu?', 'gia', '[{"type":"photo"}]'::jsonb, now(), 'new') ${extra} RETURNING id`,
    [ws, channel, post, ext],
  );
const rowOf = async (ext: string) =>
  (
    await admin.query('SELECT * FROM cf.comments WHERE channel_id = $1 AND external_id = $2', [
      channel,
      ext,
    ])
  ).rows[0];
const tombstones = async (ext: string) =>
  (
    await admin.query(
      'SELECT * FROM cf.comment_tombstones WHERE channel_id = $1 AND external_id = $2',
      [channel, ext],
    )
  ).rows;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  await seedMember(admin, ws, owner, 'owner');
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-048 xóa đến TRƯỚC tạo: dấu xóa', () => {
  it('chưa có dòng → ghi dấu xóa (kênh, mã, giờ xóa) và trả NULL; chạy lại không nhân đôi; tạo sau → dòng đã xóa trắng ngay, giữ created_time/status', async () => {
    const ext = `cm-${randomUUID()}`;
    const at = new Date('2026-11-01T10:00:00.000Z');
    expect(await asSystem((tx) => markCommentDeleted(tx, channel, ext, at))).toBeNull();
    expect(
      await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date(9_000))),
    ).toBeNull();
    const t = await tombstones(ext);
    expect(t).toHaveLength(1);
    expect(new Date(t[0].deleted_at).getTime()).toBe(at.getTime()); // giờ của lần ĐẦU

    await insertComment(ext); // sự kiện tạo đến sau
    const row = await rowOf(ext);
    expect(row.text).toBe('');
    expect(row.text_normalized).toBeNull();
    expect(row.author_name).toBeNull();
    expect(row.author_external_id).toBe('');
    expect(row.attachments).toEqual([]);
    expect(new Date(row.deleted_at).getTime()).toBe(at.getTime());
    expect(row.redacted_at).not.toBeNull();
    expect(row.status).toBe('new');
    expect(row.created_time).not.toBeNull();
  });

  it('tạo lại lần hai (ON CONFLICT) không đổi; xóa sau khi dòng đã sinh ra đã xóa → không thêm dấu xóa', async () => {
    const ext = `cm-${randomUUID()}`;
    await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date(5_000)));
    await insertComment(ext);
    const again = await insertComment(ext, 'ON CONFLICT DO NOTHING');
    expect(again.rowCount).toBe(0);
    const before = await rowOf(ext);
    expect(
      await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date(9_000))),
    ).toBeNull();
    expect(new Date((await rowOf(ext)).deleted_at).getTime()).toBe(
      new Date(before.deleted_at).getTime(),
    );
  });

  it('tạo TRƯỚC rồi xóa SAU vẫn xóa trắng và KHÔNG tạo dấu xóa; kênh khác cùng mã bình luận không bị ảnh hưởng', async () => {
    const ext = `cm-${randomUUID()}`;
    const id = (await insertComment(ext)).rows[0].id;
    expect(await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date()))).toBe(id);
    expect(await tombstones(ext)).toHaveLength(0);

    const ch2 = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P2') RETURNING id",
        [ws, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const p2 = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [ws, ch2, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const ext2 = `cm-${randomUUID()}`;
    await asSystem((tx) => markCommentDeleted(tx, channel, ext2, new Date()));
    await admin.query(
      "INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, status) VALUES ('webhook', $1,$2,$3,$4,'u','giữ nguyên','new')",
      [ws, ch2, p2, ext2],
    );
    expect(
      (
        await admin.query(
          'SELECT text, deleted_at FROM cf.comments WHERE channel_id = $1 AND external_id = $2',
          [ch2, ext2],
        )
      ).rows[0],
    ).toMatchObject({ text: 'giữ nguyên', deleted_at: null });
  });

  it('kênh của workspace khác → không ghi dấu xóa, trả NULL; người dùng không đọc được bảng dấu xóa', async () => {
    const ws2 = await seedWorkspace(admin);
    const ch2 = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P3') RETURNING id",
        [ws2, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const ext = `cm-${randomUUID()}`;
    expect(await asSystem((tx) => markCommentDeleted(tx, ch2, ext, new Date()))).toBeNull();
    expect(
      (await admin.query('SELECT 1 FROM cf.comment_tombstones WHERE external_id = $1', [ext]))
        .rowCount,
    ).toBe(0);
    const read = await db
      .withActor(ws, owner, (tx) => tx.execute(sql.raw('SELECT 1 FROM cf.comment_tombstones')))
      .then(() => 'ok', code);
    expect(read).toBe('42501');
  });
});

describe('FR-048 xóa và tạo CHẠY SONG SONG (khóa tư vấn)', () => {
  it('xóa chưa commit, tạo chèn cùng lúc → sau khi cả hai xong dòng vẫn đã xóa trắng (không còn dòng nguyên nội dung)', async () => {
    const ext = `cm-${randomUUID()}`;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let marked: () => void = () => {};
    const afterMark = new Promise<void>((resolve) => {
      marked = resolve;
    });
    // T1: ghi dấu xóa rồi GIỮ giao dịch mở.
    const t1 = asSystem(async (tx) => {
      await markCommentDeleted(tx, channel, ext, new Date(7_000));
      marked();
      await gate;
    });
    await afterMark;
    // T2: chèn bình luận (trigger phải chờ khóa của T1, rồi thấy dấu xóa đã commit).
    const t2 = insertComment(ext);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await Promise.all([t1, t2]);
    const row = await rowOf(ext);
    expect(row.text).toBe('');
    expect(row.author_name).toBeNull();
    expect(row.redacted_at).not.toBeNull();
    expect(new Date(row.deleted_at).getTime()).toBe(7_000);
  });

  it('sự kiện tạo đến SAU dấu xóa: payload của chính nó bị xóa ngay khi dòng được chèn', async () => {
    const ext = `cm-${randomUUID()}`;
    const channelExt = (
      await admin.query('SELECT external_id FROM cf.channels WHERE id = $1', [channel])
    ).rows[0].external_id;
    await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date()));
    const ev = (
      await admin.query(
        `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status)
         VALUES ($1, 'facebook', $2, $3::jsonb, 'received') RETURNING id`,
        [
          ws,
          randomUUID(),
          JSON.stringify({
            kind: 'comment_created',
            channelExternalId: channelExt,
            comment: { externalId: ext, text: 'nội dung' },
          }),
        ],
      )
    ).rows[0].id;
    await insertComment(ext);
    expect(
      (await admin.query('SELECT payload FROM cf.webhook_events WHERE id = $1', [ev])).rows[0]
        .payload,
    ).toEqual({});
  });
});

describe('WEBHOOK-PAYLOAD-RETENTION: dọn payload sau 14 ngày', () => {
  async function event(
    ageDays: number,
    status: string,
    payload: object = { comment: { text: 'nội dung' } },
  ): Promise<string> {
    return (
      await admin.query(
        `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status, created_at)
         VALUES ($1, 'facebook', $2, $3::jsonb, $4, now() - ($5 || ' days')::interval) RETURNING id`,
        [ws, randomUUID(), JSON.stringify(payload), status, String(ageDays)],
      )
    ).rows[0].id as string;
  }
  const get = async (id: string) =>
    (await admin.query('SELECT payload, status, error FROM cf.webhook_events WHERE id = $1', [id]))
      .rows[0];

  it('xóa payload sự kiện cũ hơn 14 ngày (done/dead giữ trạng thái; received/failed → dead); sự kiện mới và dòng đã {} không đổi; chạy lại trả 0', async () => {
    const oldDone = await event(15, 'done');
    const oldDead = await event(20, 'dead');
    const oldPending = await event(30, 'received');
    const oldFailed = await event(30, 'failed');
    const fresh = await event(13, 'done');
    const empty = await event(40, 'done', {});
    const result = await db.withSystem((tx) => purgeExpiredWebhookPayloads(tx, 14));
    expect(result.payloads).toBeGreaterThanOrEqual(4);
    expect((await get(oldDone)).payload).toEqual({});
    expect((await get(oldDone)).status).toBe('done');
    expect((await get(oldDead)).payload).toEqual({});
    for (const id of [oldPending, oldFailed]) {
      expect(await get(id)).toMatchObject({ payload: {}, status: 'dead', error: 'expired' });
    }
    expect((await get(fresh)).payload).toEqual({ comment: { text: 'nội dung' } });
    expect((await get(empty)).payload).toEqual({});
    expect((await db.withSystem((tx) => purgeExpiredWebhookPayloads(tx, 14))).payloads).toBe(0);
  });

  it('xóa dấu xóa cũ hơn 14 ngày, giữ dấu xóa mới', async () => {
    const oldExt = `cm-${randomUUID()}`;
    const newExt = `cm-${randomUUID()}`;
    await admin.query(
      "INSERT INTO cf.comment_tombstones (workspace_id, channel_id, external_id, deleted_at, created_at) VALUES ($1,$2,$3, now(), now() - interval '15 days')",
      [ws, channel, oldExt],
    );
    await admin.query(
      'INSERT INTO cf.comment_tombstones (workspace_id, channel_id, external_id, deleted_at) VALUES ($1,$2,$3, now())',
      [ws, channel, newExt],
    );
    const result = await db.withSystem((tx) => purgeExpiredWebhookPayloads(tx, 14));
    expect(result.tombstones).toBeGreaterThanOrEqual(1);
    expect(await tombstones(oldExt)).toHaveLength(0);
    expect(await tombstones(newExt)).toHaveLength(1);
  });

  it('chỉ ngữ cảnh trần gọi được (Owner, job có workspace, withWorkspace bị từ chối); số ngày < 1 bị từ chối', async () => {
    const viaOwner = await db
      .withActor(ws, owner, (tx) => purgeExpiredWebhookPayloads(tx, 14))
      .then(() => 'ok', code);
    const viaJob = await db
      .withJob(ws, (tx) => purgeExpiredWebhookPayloads(tx, 14))
      .then(() => 'ok', code);
    const viaWs = await db
      .withWorkspace(ws, (tx) => purgeExpiredWebhookPayloads(tx, 14))
      .then(() => 'ok', code);
    expect([viaOwner, viaJob, viaWs]).toEqual(['42501', '42501', '42501']);
    for (const days of [0, 6]) {
      const bad = await db
        .withSystem((tx) => purgeExpiredWebhookPayloads(tx, days))
        .then(() => 'ok', code);
      expect(bad).toBe('CF422');
    }
  });
});
