import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { loadChannelActivity } from '../src/queries/channels';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** Số liệu hoạt động theo kênh cho trang Cài đặt → Kênh: chỉ đọc, đúng workspace, bỏ bình luận đã xóa. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let member: string;
let channelA: string;
let channelB: string;
let channelOther: string;

async function channel(workspaceId: string, name: string): Promise<string> {
  const r = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, $3) RETURNING id",
    [workspaceId, `ext-${randomUUID()}`, name],
  );
  return r.rows[0].id as string;
}
async function post(workspaceId: string, channelId: string): Promise<string> {
  const r = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [workspaceId, channelId, `po-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}
async function comment(
  workspaceId: string,
  channelId: string,
  postId: string,
  opts: { status?: string; ageHours?: number; deleted?: boolean } = {},
): Promise<void> {
  await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, status, created_at, deleted_at)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', 'nội dung', $5, now() - ($6 || ' hours')::interval, $7)`,
    [
      workspaceId,
      channelId,
      postId,
      `cm-${randomUUID()}`,
      opts.status ?? 'new',
      String(opts.ageHours ?? 1),
      opts.deleted ? new Date() : null,
    ],
  );
}
async function inboundMessage(workspaceId: string, channelId: string, ageHours: number) {
  const conv = await admin.query(
    `INSERT INTO cf.conversations (workspace_id, channel_id, external_id, customer_external_id)
     VALUES ($1, $2, $3, 'c1') RETURNING id`,
    [workspaceId, channelId, `th-${randomUUID()}`],
  );
  const message = await admin.query(
    `INSERT INTO cf.messages (workspace_id, conversation_id, direction, text, sent_by)
     VALUES ($1, $2, 'in', 'xin chào', 'customer') RETURNING id`,
    [workspaceId, conv.rows[0].id],
  );
  // created_time có thể bị đặt lại khi chèn → lùi thời gian bằng UPDATE.
  await admin.query(
    "UPDATE cf.messages SET created_time = now() - ($2 || ' hours')::interval WHERE id = $1",
    [message.rows[0].id, String(ageHours)],
  );
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  member = await seedUser(admin, 'activity-member');
  await seedMember(admin, ws, member, 'staff');
  channelA = await channel(ws, 'Kênh A');
  channelB = await channel(ws, 'Kênh B');
  channelOther = await channel(other, 'Kênh khác');
  const pa = await post(ws, channelA);
  const pb = await post(ws, channelB);
  const po = await post(other, channelOther);
  await comment(ws, channelA, pa, { ageHours: 1 });
  await comment(ws, channelA, pa, { ageHours: 2, status: 'auto_replied' });
  await comment(ws, channelA, pa, { ageHours: 48, status: 'auto_replied' });
  await comment(ws, channelA, pa, { ageHours: 24 * 10 });
  await comment(ws, channelA, pa, { ageHours: 1, deleted: true });
  await comment(ws, channelB, pb, { ageHours: 3 });
  await comment(other, channelOther, po, { ageHours: 1 });
  await inboundMessage(ws, channelA, 2);
  await inboundMessage(ws, channelA, 72);
  await inboundMessage(other, channelOther, 1);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('loadChannelActivity', () => {
  it('đếm theo kênh: 24 giờ, 7 ngày, tự trả lời 7 ngày; bỏ bình luận đã xóa', async () => {
    const activity = await db.withActor(ws, member, (tx) => loadChannelActivity(tx, ws));
    const a = activity.byChannel[channelA];
    expect(a?.comments24h).toBe(2);
    expect(a?.comments7d).toBe(3);
    expect(a?.autoReplied7d).toBe(2);
    expect(a?.lastCommentAt).toBeInstanceOf(Date);
    expect(activity.byChannel[channelB]?.comments24h).toBe(1);
  });

  it('tổng toàn workspace gồm tin nhắn khách 24 giờ; không lẫn workspace khác', async () => {
    const activity = await db.withActor(ws, member, (tx) => loadChannelActivity(tx, ws));
    expect(activity.totals).toEqual({
      comments24h: 3,
      comments7d: 4,
      autoReplied7d: 2,
      messages24h: 1,
    });
    expect(activity.byChannel[channelOther]).toBeUndefined();
  });

  it('kênh không có hoạt động → không có khóa (không bịa số 0 có nghĩa)', async () => {
    const empty = await seedWorkspace(admin);
    const user = await seedUser(admin, 'activity-empty');
    await seedMember(admin, empty, user, 'staff');
    const activity = await db.withActor(empty, user, (tx) => loadChannelActivity(tx, empty));
    expect(activity.byChannel).toEqual({});
    expect(activity.totals).toEqual({
      comments24h: 0,
      comments7d: 0,
      autoReplied7d: 0,
      messages24h: 0,
    });
  });
});
