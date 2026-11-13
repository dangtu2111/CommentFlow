import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listPostsForWeek } from '../src/queries/post-calendar';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * COMPOSER-CALENDAR-UI — truy vấn bài của MỘT tuần cho Lịch đăng: ngày/giờ đổi sang múi giờ workspace ngay ở DB, ranh giới tuần [thứ Hai 00:00,
 * thứ Hai sau 00:00), bài chưa có giờ đăng bị bỏ, cô lập workspace/RLS.
 */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let userA: string;
let stranger: string;
let channelA: string;
let channelB: string;

async function post(ws: string, channelId: string, createdTime: string | null, message: string) {
  const r = await admin.query(
    `INSERT INTO cf.posts (workspace_id, channel_id, external_id, message, created_time, comment_count, pending_count)
     VALUES ($1, $2, $3, $4, $5, 3, 1) RETURNING id`,
    [ws, channelId, `post-${randomUUID()}`, message, createdTime],
  );
  return r.rows[0].id as string;
}
const week = (start: string, tz: string, who: 'a' | 'stranger' = 'a') =>
  db.withActor(wsA, who === 'a' ? userA : stranger, (tx) => listPostsForWeek(tx, wsA, start, tz));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  userA = await seedUser(admin, 'cal-a');
  stranger = await seedUser(admin, 'cal-stranger');
  await seedMember(admin, wsA, userA, 'owner');
  channelA = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page A') RETURNING id",
      [wsA, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  channelB = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page B') RETURNING id",
      [wsB, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  // Tuần thứ Hai 2026-11-09 → Chủ nhật 2026-11-15 (giờ Việt Nam UTC+7).
  await post(wsA, channelA, '2026-11-09T01:30:00Z', 'thứ Hai 08:30 VN'); // 2026-11-09 08:30
  await post(wsA, channelA, '2026-11-15T16:59:00Z', 'Chủ nhật 23:59 VN'); // 2026-11-15 23:59 (vẫn trong tuần)
  await post(wsA, channelA, '2026-11-15T17:00:00Z', 'thứ Hai sau 00:00 VN'); // 2026-11-16 00:00 → tuần sau
  await post(wsA, channelA, '2026-11-08T16:59:00Z', 'Chủ nhật trước 23:59 VN'); // 2026-11-08 23:59 → tuần trước
  await post(wsA, channelA, null, 'chưa có giờ đăng');
  await post(wsB, channelB, '2026-11-10T03:00:00Z', 'của workspace B');
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('listPostsForWeek', () => {
  it('chỉ bài trong tuần theo múi giờ Việt Nam; kèm ngày YYYY-MM-DD và giờ HH:MM địa phương', async () => {
    const items = await week('2026-11-09', 'Asia/Ho_Chi_Minh');
    expect(items.map((i) => [i.message, i.day, i.time])).toEqual([
      ['thứ Hai 08:30 VN', '2026-11-09', '08:30'],
      ['Chủ nhật 23:59 VN', '2026-11-15', '23:59'],
    ]);
  });

  it('cùng dữ liệu, múi giờ khác → ranh giới tuần khác (UTC: bài 17:00Z thuộc tuần này, không phải tuần sau)', async () => {
    const items = await week('2026-11-09', 'UTC');
    const messages = items.map((i) => i.message);
    expect(messages).toContain('thứ Hai sau 00:00 VN');
    expect(messages).not.toContain('Chủ nhật trước 23:59 VN');
    expect(messages).toContain('Chủ nhật 23:59 VN');
  });

  it('sắp theo thời gian tăng dần; bài chưa có giờ đăng không xuất hiện; có đếm bình luận', async () => {
    const items = await week('2026-11-09', 'Asia/Ho_Chi_Minh');
    expect(items.map((i) => i.message)).not.toContain('chưa có giờ đăng');
    expect(items[0]?.commentCount).toBe(3);
    expect(items[0]?.pendingCount).toBe(1);
    expect(items[0]?.channelName).toBe('Page A');
    expect(items[0]?.platform).toBe('facebook');
  });

  it('cô lập workspace: không thấy bài của workspace B; người lạ (không thành viên) không thấy gì', async () => {
    const items = await week('2026-11-09', 'Asia/Ho_Chi_Minh');
    expect(items.map((i) => i.message)).not.toContain('của workspace B');
    expect(await week('2026-11-09', 'Asia/Ho_Chi_Minh', 'stranger')).toEqual([]);
  });

  it('tham số sai bị chặn: ngày sai định dạng và múi giờ không tồn tại ném lỗi (không chạy truy vấn bậy)', async () => {
    await expect(week('2026-11-09; DROP TABLE x', 'UTC')).rejects.toThrow();
    await expect(week('2026-11-09', "Asia/'; DROP")).rejects.toThrow();
  });
});
