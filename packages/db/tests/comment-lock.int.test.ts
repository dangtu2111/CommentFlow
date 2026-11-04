import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { getCommentDetail } from '../src/queries/comment-detail';
import {
  acquireCommentLock,
  COMMENT_LOCK_TTL_SECONDS,
  releaseCommentLock,
} from '../src/queries/comment-lock';
import { listComments } from '../src/queries/inbox';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * INBOX-DETAIL-LOCK (FR-041, docs/11 §5): khóa mềm 2 phút. Khóa chỉ là cảnh báo (chặn gửi trùng thật là sendRecheck);
 * cấp khóa bằng MỘT câu UPDATE có điều kiện (nguyên tử), giờ theo now() của DB.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let wsOther: string;
let anna: string;
let binh: string;
let stranger: string;
let channel: string;
let post: string;

async function seedComment(workspace = ws, ch = channel, p = post): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time)
     VALUES ($1, $2, $3, $4, 'u1', 'Khách', 'Còn size M không shop? Nội dung đầy đủ của bình luận.', now()) RETURNING id`,
    [workspace, ch, p, `cm-${randomUUID()}`],
  );
  return r.rows[0].id;
}

const as = <T>(
  user: string,
  fn: Parameters<FlowDb['withActor']>[2] extends (tx: infer Tx) => unknown
    ? (tx: Tx) => Promise<T>
    : never,
  workspace = ws,
) => db.withActor(workspace, user, fn);
const acquire = (user: string, id: string, workspace = ws) =>
  as(user, (tx) => acquireCommentLock(tx, workspace, id, user), workspace);
const lockRow = async (id: string) =>
  (await admin.query('SELECT locked_by, locked_until FROM cf.comments WHERE id = $1', [id]))
    .rows[0];

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(4);
  ws = await seedWorkspace(admin);
  wsOther = await seedWorkspace(admin);
  anna = await seedUser(admin, 'An');
  binh = await seedUser(admin, 'Bình');
  stranger = await seedUser(admin, 'Người lạ');
  await seedMember(admin, ws, anna, 'staff');
  await seedMember(admin, ws, binh, 'staff');
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page A') RETURNING id",
    [ws, `p-${randomUUID()}`],
  );
  channel = ch.rows[0].id;
  const p = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id, is_ad) VALUES ($1, $2, $3, true) RETURNING id',
    [ws, channel, `post-${randomUUID()}`],
  );
  post = p.rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-041 khóa mềm — cấp, gia hạn, nhường', () => {
  it('chưa ai giữ → acquired, hạn = now + 120 giây (giờ DB)', async () => {
    const id = await seedComment();
    const before = Date.now();
    const result = await acquire(anna, id);
    expect(result.status).toBe('acquired');
    if (result.status !== 'acquired') throw new Error('status');
    const seconds = (result.until.getTime() - before) / 1000;
    expect(COMMENT_LOCK_TTL_SECONDS).toBe(120);
    expect(seconds).toBeGreaterThan(115);
    expect(seconds).toBeLessThan(125);
    expect((await lockRow(id)).locked_by).toBe(anna);
  });

  it('chính mình giữ → gia hạn (hạn mới muộn hơn)', async () => {
    const id = await seedComment();
    const first = await acquire(anna, id);
    await admin.query(
      "UPDATE cf.comments SET locked_until = now() + interval '5 seconds' WHERE id = $1",
      [id],
    );
    const second = await acquire(anna, id);
    expect(first.status).toBe('acquired');
    expect(second.status).toBe('acquired');
    if (second.status !== 'acquired') throw new Error('status');
    expect(second.until.getTime() - Date.now()).toBeGreaterThan(100_000);
  });

  it('người khác giữ còn hạn → held (kèm tên người giữ), KHÔNG đổi khóa', async () => {
    const id = await seedComment();
    await acquire(anna, id);
    const before = await lockRow(id);
    const result = await acquire(binh, id);
    expect(result).toMatchObject({ status: 'held', holderId: anna, holderName: 'An' });
    const after = await lockRow(id);
    expect(after.locked_by).toBe(anna);
    expect(new Date(after.locked_until).getTime()).toBe(new Date(before.locked_until).getTime());
  });

  it('khóa hết hạn → người khác lấy được', async () => {
    const id = await seedComment();
    await acquire(anna, id);
    await admin.query(
      "UPDATE cf.comments SET locked_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect((await acquire(binh, id)).status).toBe('acquired');
    expect((await lockRow(id)).locked_by).toBe(binh);
  });

  it('bình luận không tồn tại / của workspace khác / người ngoài workspace → not_found', async () => {
    const id = await seedComment();
    expect(await acquire(anna, randomUUID())).toEqual({ status: 'not_found' });
    expect(await acquire(stranger, id)).toEqual({ status: 'not_found' });
    expect(await as(anna, (tx) => acquireCommentLock(tx, wsOther, id, anna))).toEqual({
      status: 'not_found',
    });
    expect((await lockRow(id)).locked_by).toBeNull();
  });

  it('hai người lấy khóa CÙNG LÚC → đúng một người thắng', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await seedComment();
      const [a, b] = await Promise.all([acquire(anna, id), acquire(binh, id)]);
      const winners = [a, b].filter((r) => r.status === 'acquired');
      expect(winners, `lần ${i}`).toHaveLength(1);
      expect([a, b].filter((r) => r.status === 'held')).toHaveLength(1);
    }
  });
});

describe('FR-041 mở khóa', () => {
  it('chỉ người đang giữ mở được; người khác gọi → không đổi gì', async () => {
    const id = await seedComment();
    await acquire(anna, id);
    expect(await as(binh, (tx) => releaseCommentLock(tx, ws, id, binh))).toBe(false);
    expect((await lockRow(id)).locked_by).toBe(anna);
    expect(await as(anna, (tx) => releaseCommentLock(tx, ws, id, anna))).toBe(true);
    const row = await lockRow(id);
    expect(row.locked_by).toBeNull();
    expect(row.locked_until).toBeNull();
  });

  it('không ai giữ / đã hết hạn / không tồn tại → false, không lỗi', async () => {
    const id = await seedComment();
    expect(await as(anna, (tx) => releaseCommentLock(tx, ws, id, anna))).toBe(false);
    expect(await as(anna, (tx) => releaseCommentLock(tx, ws, randomUUID(), anna))).toBe(false);
  });
});

describe('FR-041 chi tiết bình luận + chip khóa ở danh sách', () => {
  it('getCommentDetail trả đủ trường thật (tác giả, kênh, bài, văn bản đầy đủ, người giữ khóa); id workspace khác/người ngoài → null', async () => {
    const id = await seedComment();
    await acquire(anna, id);
    const detail = await as(binh, (tx) => getCommentDetail(tx, ws, id, binh));
    expect(detail).toMatchObject({
      id,
      authorName: 'Khách',
      text: 'Còn size M không shop? Nội dung đầy đủ của bình luận.',
      status: 'new',
      channelName: 'Page A',
      platform: 'facebook',
      isAd: true,
      lock: { holderId: anna, holderName: 'An', heldByMe: false },
    });
    expect(typeof detail?.postExternalId).toBe('string');
    const mine = await as(anna, (tx) => getCommentDetail(tx, ws, id, anna));
    expect(mine?.lock).toMatchObject({ heldByMe: true });
    expect(await as(stranger, (tx) => getCommentDetail(tx, ws, id, stranger))).toBeNull();
    expect(await as(anna, (tx) => getCommentDetail(tx, wsOther, id, anna))).toBeNull();
    expect(await as(anna, (tx) => getCommentDetail(tx, ws, randomUUID(), anna))).toBeNull();
  });

  it('khóa hết hạn → chi tiết không còn người giữ (lock = null)', async () => {
    const id = await seedComment();
    await acquire(anna, id);
    await admin.query(
      "UPDATE cf.comments SET locked_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    const detail = await as(binh, (tx) => getCommentDetail(tx, ws, id, binh));
    expect(detail?.lock).toBeNull();
  });

  it('danh sách có lockedByName/lockedUntil CHỈ khi khóa còn hạn và không phải của mình', async () => {
    const id = await seedComment();
    await acquire(anna, id);
    const asBinh = await as(binh, (tx) =>
      listComments(tx, ws, { tab: 'all', sort: 'newest', limit: 100 }, binh),
    );
    const asAnna = await as(anna, (tx) =>
      listComments(tx, ws, { tab: 'all', sort: 'newest', limit: 100 }, anna),
    );
    expect(asBinh.items.find((i) => i.id === id)?.lockedByName).toBe('An');
    expect(asAnna.items.find((i) => i.id === id)?.lockedByName).toBeNull();
    await admin.query(
      "UPDATE cf.comments SET locked_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    const expired = await as(binh, (tx) =>
      listComments(tx, ws, { tab: 'all', sort: 'newest', limit: 100 }, binh),
    );
    expect(expired.items.find((i) => i.id === id)?.lockedByName).toBeNull();
  });
});

describe('FB-REPLY chi tiết: trạng thái kênh và yêu cầu trả lời mới nhất', () => {
  it('trả channelStatus và latestReply (yêu cầu MỚI NHẤT); chưa có yêu cầu → null; người ngoài/workspace khác vẫn null', async () => {
    const id = await seedComment();
    const none = await as(anna, (tx) => getCommentDetail(tx, ws, id, anna));
    expect(none).toMatchObject({ channelStatus: 'connected', latestReply: null });

    const first = (
      await admin.query(
        `INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, requested_by, previous_status, status, error_code)
         VALUES ($1, $2, $3, 'Câu cũ', $4, 'pending_review', 'failed', 'TOKEN_EXPIRED') RETURNING id`,
        [ws, channel, id, anna],
      )
    ).rows[0].id as string;
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = (
      await admin.query(
        `INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, requested_by, previous_status, status)
         VALUES ($1, $2, $3, 'Câu mới', $4, 'send_failed', 'queued') RETURNING id`,
        [ws, channel, id, anna],
      )
    ).rows[0].id as string;
    const detail = await as(binh, (tx) => getCommentDetail(tx, ws, id, binh));
    expect(detail?.latestReply).toMatchObject({
      id: second,
      status: 'queued',
      text: 'Câu mới',
      errorCode: null,
    });
    expect(detail?.latestReply?.id).not.toBe(first);

    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [channel]);
    expect((await as(anna, (tx) => getCommentDetail(tx, ws, id, anna)))?.channelStatus).toBe(
      'expired',
    );
    await admin.query("UPDATE cf.channels SET status = 'connected' WHERE id = $1", [channel]);

    expect(await as(stranger, (tx) => getCommentDetail(tx, ws, id, stranger))).toBeNull();
    expect(await as(anna, (tx) => getCommentDetail(tx, wsOther, id, anna))).toBeNull();
  });
});
