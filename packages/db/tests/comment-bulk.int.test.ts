import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { relabelComments, skipComments } from '../src/queries/comment-bulk';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * BULK-ACTIONS (FR-045, US-010): Bỏ qua / Đổi nhãn hàng loạt = MỘT UPDATE có điều kiện, qua quyền thành viên.
 * Ẩn hàng loạt đi đường `requestCommentHide` từng cái (đã có test ở comment-hides).
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let wsOther: string;
let anna: string;
let binh: string;
let channel: string;
let post: string;
let channelOther: string;
let postOther: string;

async function seedComment(
  status = 'pending_review',
  workspace = ws,
  ch = channel,
  p = post,
): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, status, created_time)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', 'Còn size M không shop?', $5, now()) RETURNING id`,
    [workspace, ch, p, `cm-${randomUUID()}`, status],
  );
  return r.rows[0].id;
}
const row = async (id: string) =>
  (
    await admin.query(
      'SELECT status, label, label_source, label_confidence, labels, is_hidden FROM cf.comments WHERE id = $1',
      [id],
    )
  ).rows[0];
const skip = (user: string, ids: string[], workspace = ws) =>
  db.withActor(workspace, user, (tx) => skipComments(tx, workspace, user, ids));
const relabel = (user: string, ids: string[], label: string, workspace = ws) =>
  db.withActor(workspace, user, (tx) => relabelComments(tx, workspace, user, ids, label));

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

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(4);
  ws = await seedWorkspace(admin);
  wsOther = await seedWorkspace(admin);
  anna = await seedUser(admin, 'An');
  binh = await seedUser(admin, 'Bình');
  await seedMember(admin, ws, anna, 'staff');
  await seedMember(admin, ws, binh, 'staff');
  [channel, post] = await seedChannelAndPost(ws);
  [channelOther, postOther] = await seedChannelAndPost(wsOther);
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-045 skipComments — Bỏ qua hàng loạt', () => {
  it('FR-045 đổi các bình luận "của người" sang skipped; trạng thái khác giữ nguyên, không hủy cả lô', async () => {
    const ok1 = await seedComment('pending_review');
    const ok2 = await seedComment('needs_human');
    const replied = await seedComment('replied');
    const sending = await seedComment('sending');
    const changed = await skip(anna, [ok1, ok2, replied, sending]);
    expect(changed.sort()).toEqual([ok1, ok2].sort());
    expect((await row(ok1)).status).toBe('skipped');
    expect((await row(replied)).status).toBe('replied');
    expect((await row(sending)).status).toBe('sending');
  });

  it('FR-045 bình luận đã xóa trên nền tảng không bị đổi', async () => {
    const id = await seedComment('new');
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [id]);
    expect(await skip(anna, [id])).toEqual([]);
  });

  it('FR-045 bình luận bị đồng nghiệp khóa còn hạn bị bỏ qua (không hủy lô); khóa của chính mình thì đổi được', async () => {
    const lockedByBinh = await seedComment('pending_review');
    const lockedByAnna = await seedComment('pending_review');
    const free = await seedComment('pending_review');
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '1 minute' WHERE id = $1",
      [lockedByBinh, binh],
    );
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '1 minute' WHERE id = $1",
      [lockedByAnna, anna],
    );
    const changed = await skip(anna, [lockedByBinh, lockedByAnna, free]);
    expect(changed.sort()).toEqual([lockedByAnna, free].sort());
    expect((await row(lockedByBinh)).status).toBe('pending_review');
  });

  it('FR-045 404 chéo workspace: id của workspace khác không đổi và không xuất hiện trong kết quả', async () => {
    const mine = await seedComment('pending_review');
    const theirs = await seedComment('pending_review', wsOther, channelOther, postOther);
    expect(await skip(anna, [mine, theirs])).toEqual([mine]);
    expect((await row(theirs)).status).toBe('pending_review');
    // Người ngoài workspace (anna không thuộc wsOther) gọi với workspace khác: RLS chặn, không đổi gì.
    expect(await skip(anna, [theirs], wsOther)).toEqual([]);
    expect((await row(theirs)).status).toBe('pending_review');
  });

  it('FR-045 danh sách rỗng → không gọi DB, trả []', async () => {
    expect(await skip(anna, [])).toEqual([]);
  });
});

describe('FR-045 relabelComments — Đổi nhãn hàng loạt', () => {
  it('FR-045 ghi label + label_source=human + độ tin cậy 1 + labels một phần tử, không đổi trạng thái', async () => {
    const a = await seedComment('pending_review');
    const b = await seedComment('replied');
    expect((await relabel(anna, [a, b], 'complaint')).sort()).toEqual([a, b].sort());
    const r = await row(a);
    expect(r).toMatchObject({
      label: 'complaint',
      label_source: 'human',
      status: 'pending_review',
    });
    expect(Number(r.label_confidence)).toBe(1);
    expect(r.labels).toEqual([{ label: 'complaint', confidence: 1 }]);
    expect((await row(b)).status).toBe('replied');
  });

  it('FR-045 404 chéo workspace: id của workspace khác không đổi nhãn', async () => {
    const theirs = await seedComment('pending_review', wsOther, channelOther, postOther);
    expect(await relabel(anna, [theirs], 'spam')).toEqual([]);
    expect(await relabel(anna, [theirs], 'spam', wsOther)).toEqual([]);
    expect((await row(theirs)).label).toBeNull();
  });

  it('FR-045 bỏ qua dòng bị đồng nghiệp khóa còn hạn và dòng đang processing/sending', async () => {
    const locked = await seedComment('pending_review');
    const busy = await seedComment('sending');
    const free = await seedComment('pending_review');
    await admin.query(
      "UPDATE cf.comments SET locked_by = $2, locked_until = now() + interval '1 minute' WHERE id = $1",
      [locked, binh],
    );
    expect(await relabel(anna, [locked, busy, free], 'other')).toEqual([free]);
  });

  it('FR-045 không đổi is_hidden (ẩn chỉ qua đường yêu cầu ẩn)', async () => {
    const a = await seedComment('pending_review');
    await relabel(anna, [a], 'other');
    expect((await row(a)).is_hidden).toBe(false);
  });
});
