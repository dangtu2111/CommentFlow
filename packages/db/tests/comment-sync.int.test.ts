import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, FlowDb } from '../src/client';
import { getCommentDetail } from '../src/queries/comment-detail';
import { countCommentsByTab, listComments } from '../src/queries/inbox';
import { ReplyRejectedError, requestCommentReply } from '../src/replies';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * COMMENT-EDIT-DELETE (FR-048): bình luận bị khách xóa → `deleted_at` (giữ dòng + log). Chỉ hệ thống ghi (trigger);
 * inbox bỏ bình luận đã xóa; không trả lời được bình luận đã xóa.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;
let staff: string;
let channel: string;
let post: string;

async function comment(text: string, deleted = false): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, created_time, status, deleted_at)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', $5, now(), 'pending_review', $6) RETURNING id`,
    [ws, channel, post, `cm-${randomUUID()}`, text, deleted ? new Date() : null],
  );
  return r.rows[0].id;
}

const asOwner = <T>(fn: (tx: Database) => Promise<T>) => db.withActor(ws, owner, fn);
const code = (error: unknown) => {
  if (error instanceof ReplyRejectedError) return error.reason;
  const e = error as { cause?: { code?: string }; code?: string };
  return e.cause?.code ?? e.code ?? 'unknown';
};

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  staff = await seedUser(admin, 'staff');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
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

describe('FR-048 trigger: người dùng không đặt/gỡ deleted_at', () => {
  it('Owner/Staff không đặt được deleted_at, không gỡ được khi đã đặt; hệ thống (worker) đặt được; admin (chủ bảng) được qua', async () => {
    const live = await comment('còn sống');
    const dead = await comment('đã xóa', true);
    for (const user of [owner, staff]) {
      const set = await db
        .withActor(ws, user, (tx) =>
          tx.execute(sql.raw(`UPDATE cf.comments SET deleted_at = now() WHERE id = '${live}'`)),
        )
        .then(() => 'ok', code);
      expect(set).toBe('42501');
      const clear = await db
        .withActor(ws, user, (tx) =>
          tx.execute(sql.raw(`UPDATE cf.comments SET deleted_at = NULL WHERE id = '${dead}'`)),
        )
        .then(() => 'ok', code);
      expect(clear).toBe('42501');
    }
    const synced = await db
      .withActor(ws, staff, (tx) =>
        tx.execute(sql.raw(`UPDATE cf.comments SET text_synced_at = now() WHERE id = '${live}'`)),
      )
      .then(() => 'ok', code);
    expect(synced).toBe('42501'); // mốc đồng bộ nội dung cũng chỉ hệ thống ghi
    // Từ migration 0025 chỉ hàm DEFINER (kèm xóa trắng) đặt được deleted_at — xem comment-redact.int.test.ts.
    const system = await db.withJob(ws, (tx) =>
      tx.execute(
        sql.raw(
          `SELECT cf.mark_comment_deleted('${channel}'::uuid, (SELECT external_id FROM cf.comments WHERE id = '${live}'), NULL)`,
        ),
      ),
    );
    expect(system.rowCount).toBe(1);
    expect(
      (await admin.query('SELECT deleted_at FROM cf.comments WHERE id = $1', [live])).rows[0]
        .deleted_at,
    ).not.toBeNull();
  });
});

describe('FR-048 không trả lời được bình luận đã xóa', () => {
  it('request_comment_reply → not_replyable (CF409), không tạo yêu cầu, bình luận giữ nguyên trạng thái', async () => {
    const dead = await comment('khách đã xóa', true);
    const error = await asOwner((tx) =>
      requestCommentReply(tx, { commentId: dead, text: 'Dạ ạ' }),
    ).then(() => 'ok', code);
    expect(error).toBe('not_replyable');
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS n FROM cf.comment_replies WHERE comment_id = $1',
          [dead],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [dead])).rows[0].status,
    ).toBe('pending_review');
    // bình luận còn sống vẫn trả lời được
    const live = await comment('còn sống');
    expect(
      await asOwner((tx) => requestCommentReply(tx, { commentId: live, text: 'Dạ ạ' })).then(
        () => 'ok',
        code,
      ),
    ).toBe('ok');
  });
});

describe('FR-048 inbox bỏ bình luận đã xóa; chi tiết trả deletedAt', () => {
  it('danh sách và số lượng tab không tính bình luận đã xóa (khớp nhau); chi tiết vẫn mở được kèm deletedAt', async () => {
    const ws2 = await seedWorkspace(admin);
    const u = await seedUser(admin, 'u');
    await seedMember(admin, ws2, u, 'owner');
    const ch = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P2') RETURNING id",
        [ws2, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const p = (
      await admin.query(
        "INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, 'x') RETURNING id",
        [ws2, ch],
      )
    ).rows[0].id;
    const add = async (text: string, deleted: boolean) =>
      (
        await admin.query(
          `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, created_time, deleted_at)
         VALUES ('webhook', $1, $2, $3, $4, 'u', $5, now(), $6) RETURNING id`,
          [ws2, ch, p, `c-${randomUUID()}`, text, deleted ? new Date() : null],
        )
      ).rows[0].id as string;
    await add('còn', false);
    const gone = await add('đã xóa', true);
    const filter = { tab: 'all' as const, sort: 'oldest' as const };
    const items = (await db.withActor(ws2, u, (tx) => listComments(tx, ws2, filter, u))).items;
    expect(items.map((i) => i.text)).toEqual(['còn']);
    const counts = await db.withActor(ws2, u, (tx) => countCommentsByTab(tx, ws2, filter));
    expect(counts.all).toBe(1);
    expect(counts.new).toBe(1);
    const detail = await db.withActor(ws2, u, (tx) => getCommentDetail(tx, ws2, gone, u));
    expect(detail?.deletedAt).not.toBeNull();
    expect(
      (
        await db.withActor(ws2, u, async (tx) =>
          getCommentDetail(tx, ws2, await add('khác', false), u),
        )
      )?.deletedAt,
    ).toBeNull();
  });
});
