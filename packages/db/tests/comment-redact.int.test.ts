import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import { markCommentDeleted } from '../src/comment-redact';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * COMMENT-PRIVACY-ON-DELETE (FR-048): khách xóa bình luận → giữ dòng/trạng thái/thời điểm/log nhưng XÓA TRẮNG nội dung và
 * danh tính khách + bản sao trong webhook_events.payload. Chỉ hàm DEFINER `cf.mark_comment_deleted` (đường hệ thống) làm.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;
let channel: string;
let channelExt: string;
let post: string;

const code = (error: unknown) => {
  const e = error as { cause?: { code?: string }; code?: string };
  return e.cause?.code ?? e.code ?? 'unknown';
};

async function comment(extId = `cm-${randomUUID()}`): Promise<{ id: string; ext: string }> {
  const r = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, text_normalized, created_time, status)
     VALUES ('webhook', $1, $2, $3, $4, 'fb-user-1', 'Nguyễn Văn A', 'Giá bao nhiêu? 0901234567', 'gia bao nhieu', now(), 'pending_review') RETURNING id`,
    [ws, channel, post, extId],
  );
  return { id: r.rows[0].id, ext: extId };
}

async function event(
  extId: string,
  kind: 'comment_created' | 'comment_edited' | 'comment_deleted',
  opts: { status?: string; workspace?: string; channelExternalId?: string } = {},
): Promise<string> {
  const payload =
    kind === 'comment_deleted'
      ? { kind, channelExternalId: opts.channelExternalId ?? channelExt, commentExternalId: extId }
      : {
          kind,
          channelExternalId: opts.channelExternalId ?? channelExt,
          comment: { externalId: extId, text: 'nội dung khách', authorName: 'Nguyễn Văn A' },
        };
  const r = await admin.query(
    `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status)
     VALUES ($1, 'facebook', $2, $3::jsonb, $4) RETURNING id`,
    [opts.workspace ?? ws, randomUUID(), JSON.stringify(payload), opts.status ?? 'done'],
  );
  return r.rows[0].id;
}

const row = async (id: string) =>
  (await admin.query('SELECT * FROM cf.comments WHERE id = $1', [id])).rows[0];
const payloadOf = async (id: string) =>
  (await admin.query('SELECT payload, status FROM cf.webhook_events WHERE id = $1', [id])).rows[0];
const asSystem = <T>(fn: (tx: Database) => Promise<T>) => db.withJob(ws, fn);

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  await seedMember(admin, ws, owner, 'owner');
  channelExt = `p-${randomUUID()}`;
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
      [ws, channelExt],
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

describe('FR-048 xóa trắng khi khách xóa bình luận', () => {
  it('đặt deleted_at + redacted_at, xóa trắng text/text_normalized/author_name/author_external_id; GIỮ trạng thái, thời điểm, external_id, liên kết trả lời, nhật ký', async () => {
    const c = await comment();
    const before = await row(c.id);
    await admin.query(
      `INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, previous_status, status)
       VALUES ($1, $2, $3, 'Dạ 200k ạ', 'pending_review', 'failed')`,
      [ws, channel, c.id],
    );
    await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, action, target_type, target_id)
       VALUES ($1, 'system', 'comment.created', 'comment', $2)`,
      [ws, c.id],
    );
    const at = new Date('2026-11-01T10:00:00.000Z');
    const id = await asSystem((tx) => markCommentDeleted(tx, channel, c.ext, at));
    expect(id).toBe(c.id);
    const after = await row(c.id);
    expect(after.text).toBe('');
    expect(after.text_normalized).toBeNull();
    expect(after.author_name).toBeNull();
    expect(after.author_external_id).toBe('');
    expect(new Date(after.deleted_at).getTime()).toBe(at.getTime());
    expect(after.redacted_at).not.toBeNull();
    expect(after.attachments).toEqual([]);
    expect(after.status).toBe(before.status);
    expect(after.external_id).toBe(before.external_id);
    expect(new Date(after.created_time).getTime()).toBe(new Date(before.created_time).getTime());
    expect(
      (
        await admin.query('SELECT count(*)::int n FROM cf.comment_replies WHERE comment_id = $1', [
          c.id,
        ])
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await admin.query('SELECT count(*)::int n FROM core.action_logs WHERE target_id = $1', [
          c.id,
        ])
      ).rows[0].n,
    ).toBe(1);
  });

  it('chạy lại không đổi gì (giữ giờ xóa + redacted_at); bình luận không tồn tại → NULL, không lỗi', async () => {
    const c = await comment();
    const first = await asSystem((tx) => markCommentDeleted(tx, channel, c.ext, new Date(5_000)));
    const snapshot = await row(c.id);
    const again = await asSystem((tx) => markCommentDeleted(tx, channel, c.ext, new Date(9_000)));
    expect(first).toBe(c.id);
    expect(again).toBeNull();
    const after = await row(c.id);
    expect(new Date(after.deleted_at).getTime()).toBe(5_000);
    expect(new Date(after.redacted_at).getTime()).toBe(new Date(snapshot.redacted_at).getTime());
    expect(
      await asSystem((tx) => markCommentDeleted(tx, channel, 'khong-co', new Date())),
    ).toBeNull();
  });

  it('không có giờ sự kiện → dùng now()', async () => {
    const c = await comment();
    await asSystem((tx) => markCommentDeleted(tx, channel, c.ext, undefined));
    expect(Math.abs(Date.now() - new Date((await row(c.id)).deleted_at).getTime())).toBeLessThan(
      60_000,
    );
  });

  it('chỉ đường hệ thống gọi được: Owner, ngữ cảnh trần, withWorkspace (đọc) đều bị từ chối và không đổi dữ liệu', async () => {
    const c = await comment();
    const viaOwner = await db
      .withActor(ws, owner, (tx) => markCommentDeleted(tx, channel, c.ext, new Date()))
      .then(() => 'ok', code);
    const viaBare = await db
      .withSystem((tx) => markCommentDeleted(tx, channel, c.ext, new Date()))
      .then(() => 'ok', code);
    const viaWorkspace = await db
      .withWorkspace(ws, (tx) => markCommentDeleted(tx, channel, c.ext, new Date()))
      .then(() => 'ok', code);
    expect([viaOwner, viaBare, viaWorkspace]).toEqual(['42501', '42501', '42501']);
    const after = await row(c.id);
    expect(after.deleted_at).toBeNull();
    expect(after.text).not.toBe('');
  });

  it('không xóa nhầm bình luận kênh/workspace khác cùng external_id', async () => {
    const ws2 = await seedWorkspace(admin);
    const ch2 = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P2') RETURNING id",
        [ws2, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const p2 = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [ws2, ch2, `post-${randomUUID()}`],
      )
    ).rows[0].id;
    const ext = `cm-${randomUUID()}`;
    const other = (
      await admin.query(
        `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, status)
         VALUES ('webhook', $1, $2, $3, $4, 'u', 'của workspace khác', 'new') RETURNING id`,
        [ws2, ch2, p2, ext],
      )
    ).rows[0].id;
    const mine = await comment(ext);
    expect(await asSystem((tx) => markCommentDeleted(tx, ch2, ext, new Date()))).toBeNull(); // kênh của ws2, job của ws
    expect(await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date()))).toBe(mine.id);
    expect((await row(other)).text).toBe('của workspace khác');
  });

  it('người dùng không đổi được redacted_at / author_external_id (trigger)', async () => {
    const c = await comment();
    for (const col of ['redacted_at = now()', "author_external_id = 'x'"]) {
      const result = await db
        .withActor(ws, owner, (tx) =>
          tx.execute(sql.raw(`UPDATE cf.comments SET ${col} WHERE id = '${c.id}'`)),
        )
        .then(() => 'ok', code);
      expect(['42501']).toContain(result);
    }
    // cf_app không còn quyền cột deleted_at: đường duy nhất là hàm DEFINER (không thể đặt deleted_at mà quên xóa trắng).
    const direct = await db
      .withJob(ws, (tx) =>
        tx.execute(sql.raw(`UPDATE cf.comments SET deleted_at = now() WHERE id = '${c.id}'`)),
      )
      .then(() => 'ok', code);
    expect(direct).toBe('42501');
  });
});

describe('FR-048 xóa bản sao nội dung trong webhook_events.payload', () => {
  it('payload tạo/sửa của CHÍNH bình luận → {}; dòng chưa xử lý → dead (không tạo lại nội dung); sự kiện xóa, bình luận khác, workspace khác không đụng', async () => {
    const c = await comment();
    const created = await event(c.ext, 'comment_created', { status: 'done' });
    const edited = await event(c.ext, 'comment_edited', { status: 'received' });
    const failed = await event(c.ext, 'comment_edited', { status: 'failed' });
    const del = await event(c.ext, 'comment_deleted');
    const otherComment = await event(`khac-${randomUUID()}`, 'comment_created');
    const otherChannel = await event(c.ext, 'comment_created', { channelExternalId: 'trang-khac' });
    const ws2 = await seedWorkspace(admin);
    const otherWs = await event(c.ext, 'comment_created', { workspace: ws2 });

    await asSystem((tx) => markCommentDeleted(tx, channel, c.ext, new Date()));

    expect((await payloadOf(created)).payload).toEqual({});
    expect((await payloadOf(created)).status).toBe('done');
    for (const id of [edited, failed]) {
      const r = await payloadOf(id);
      expect(r.payload).toEqual({});
      expect(r.status).toBe('dead');
    }
    expect((await payloadOf(del)).payload).toMatchObject({ commentExternalId: c.ext });
    for (const id of [otherComment, otherChannel, otherWs]) {
      expect((await payloadOf(id)).payload).not.toEqual({});
    }
  });
});

describe('FR-048 dòng đã xóa trắng không bị ghi lại nội dung (trigger), payload xóa vô điều kiện', () => {
  it('đường hệ thống (job) không ghi lại text/author/attachments/deleted_at vào dòng đã redacted; chủ bảng thì được (migration/admin)', async () => {
    const c = await comment();
    await asSystem((tx) => markCommentDeleted(tx, channel, c.ext, new Date()));
    for (const set of [
      "text = 'lộ lại'",
      "author_name = 'A'",
      "attachments = '[{}]'::jsonb",
      'deleted_at = NULL',
      "text_normalized = 'x'",
    ]) {
      const r = await db
        .withJob(ws, (tx) =>
          tx.execute(sql.raw(`UPDATE cf.comments SET ${set} WHERE id = '${c.id}'`)),
        )
        .then(() => 'ok', code);
      expect(['42501']).toContain(r);
    }
    expect((await row(c.id)).text).toBe('');
  });

  it('sự kiện xóa đến TRƯỚC khi có dòng: vẫn xóa payload tạo/sửa đã nhận (không để lại nội dung)', async () => {
    const ext = `cm-${randomUUID()}`;
    const created = await event(ext, 'comment_created', { status: 'received' });
    expect(await asSystem((tx) => markCommentDeleted(tx, channel, ext, new Date()))).toBeNull();
    const r = await payloadOf(created);
    expect(r.payload).toEqual({});
    expect(r.status).toBe('dead');
  });
});

describe('FR-048 migration xóa trắng các bình luận đã xóa từ trước (backfill)', () => {
  it('migration 0025 có phần backfill theo deleted_at IS NOT NULL AND redacted_at IS NULL', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(__dirname, '../migrations/0025_comment_redact.sql');
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toMatch(/deleted_at IS NOT NULL AND redacted_at IS NULL/);
  });
});
