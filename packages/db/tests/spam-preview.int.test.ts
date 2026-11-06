import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listRecentCommentTexts } from '../src/queries/spam-preview';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** SPAM-RULES (FR-080): nguồn xem trước 7 ngày — chỉ workspace hiện tại, bỏ dòng cũ/đã xóa, giữ is_own. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let wsOther: string;
let owner: string;
let channel: string;
let post: string;
let channelOther: string;
let postOther: string;

async function seedChannelAndPost(workspace: string): Promise<[string, string]> {
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [workspace, `p-${randomUUID()}`],
  );
  const p = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [workspace, ch.rows[0].id, `post-${randomUUID()}`],
  );
  return [ch.rows[0].id, p.rows[0].id];
}

async function seed(
  text: string,
  o: { workspace?: string; ageDays?: number; own?: boolean; deleted?: boolean } = {},
): Promise<string> {
  const workspace = o.workspace ?? ws;
  const [ch, p] = workspace === ws ? [channel, post] : [channelOther, postOther];
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, is_own, deleted_at, created_time)
     VALUES ($1, $2, $3, $4, 'u1', $5, 'new', $6, CASE WHEN $7::boolean THEN now() END, now() - make_interval(days => $8::int)) RETURNING id`,
    [
      workspace,
      ch,
      p,
      `cm-${randomUUID()}`,
      text,
      o.own ?? false,
      o.deleted ?? false,
      o.ageDays ?? 0,
    ],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(4);
  ws = await seedWorkspace(admin);
  wsOther = await seedWorkspace(admin);
  owner = await seedUser(admin, 'Chủ');
  await seedMember(admin, ws, owner, 'owner');
  [channel, post] = await seedChannelAndPost(ws);
  [channelOther, postOther] = await seedChannelAndPost(wsOther);
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-080 listRecentCommentTexts — nguồn xem trước quy tắc spam', () => {
  it('FR-080 chỉ lấy bình luận trong 7 ngày của workspace hiện tại; bỏ đã xóa; giữ is_own; không thấy workspace khác', async () => {
    const recent = await seed('zalo 0912345678');
    const own = await seed('zalo của shop', { own: true });
    await seed('cũ 10 ngày', { ageDays: 10 });
    await seed('đã xóa', { deleted: true });
    const foreign = await seed('của workspace khác', { workspace: wsOther });

    const rows = await db.withActor(ws, owner, (tx) => listRecentCommentTexts(tx, ws, { days: 7 }));
    const ids = rows.map((r) => r.id);
    expect(ids.sort()).toEqual([recent, own].sort());
    expect(ids).not.toContain(foreign);
    expect(rows.find((r) => r.id === own)?.isOwn).toBe(true);
  });

  it('FR-080 cắt văn bản theo textMax và tôn trọng limit', async () => {
    await seed('x'.repeat(50));
    const rows = await db.withActor(ws, owner, (tx) =>
      listRecentCommentTexts(tx, ws, { days: 7, limit: 1, textMax: 10 }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text.length).toBeLessThanOrEqual(10);
  });

  it('FR-080 truyền workspaceId khác với phiên → RLS không trả gì', async () => {
    const rows = await db.withActor(ws, owner, (tx) =>
      listRecentCommentTexts(tx, wsOther, { days: 7 }),
    );
    expect(rows).toEqual([]);
  });
});
