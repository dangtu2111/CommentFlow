import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { getPublishPost, savePublishPost, updatePublishPost } from '../src/publish-posts';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * CALENDAR-DND (migration 0095, Q-PUB6): sửa nhanh nội dung/giờ của bài nháp/đã lên lịch trên Lịch (kéo thả, hộp thoại). Chỉ Owner; giữ nguyên kênh; chỉ khi chưa có mục tiêu đi tiếp;
 * giờ trong khoảng 2 phút – 90 ngày; lên lịch cần nội dung + kênh còn kết nối.
 */
const RLS = '42501';
const INVALID = '22023';
const NOT_EDITABLE = '55000';
const IN = (minutes: number) => new Date(Date.now() + minutes * 60_000);

let admin: pg.Pool;
let app: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let fb: string;
let expired: string;

const asOwner = <T>(fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>) =>
  app.withActor(ws, owner, fn);
const scheduled = (message = 'Hàng mới') =>
  asOwner((tx) => savePublishPost(tx, { message, channelIds: [fb], scheduledAt: IN(60 * 24 * 3) }));
const rowOf = async (id: string) =>
  (
    await admin.query('SELECT message, status, scheduled_at FROM cf.publish_posts WHERE id = $1', [
      id,
    ])
  ).rows[0];

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'upd-owner');
  staff = await seedUser(admin, 'upd-staff');
  otherOwner = await seedUser(admin, 'upd-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
  const mk = async (status: string) =>
    (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', $3) RETURNING id",
        [ws, `ext-${randomUUID()}`, status],
      )
    ).rows[0].id as string;
  fb = await mk('connected');
  expired = await mk('connected');
});
afterAll(async () => {
  await app.close();
  await admin.end();
});

describe('đổi giờ (kéo thả) và nội dung', () => {
  it('bài đã lên lịch: đổi giờ giữ nguyên nội dung và kênh; ghi nhật ký không kèm nội dung', async () => {
    const id = await scheduled('Nội dung giữ nguyên');
    const next = IN(60 * 24 * 5);
    await asOwner((tx) =>
      updatePublishPost(tx, { id, message: 'Nội dung giữ nguyên', scheduledAt: next }),
    );
    const row = await rowOf(id);
    expect(row.status).toBe('scheduled');
    expect(new Date(row.scheduled_at).getTime()).toBe(next.getTime());
    const post = await asOwner((tx) => getPublishPost(tx, ws, id));
    expect(post?.targets).toHaveLength(1);
    const logs = await admin.query(
      "SELECT after FROM core.action_logs WHERE target_id = $1 AND action = 'publish_post.updated'",
      [id],
    );
    expect(logs.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs.rows)).not.toContain('Nội dung giữ nguyên');
  });

  it('sửa nội dung và bỏ giờ → thành bản nháp (giữ kênh); nháp có thể lên lịch lại', async () => {
    const id = await scheduled();
    await asOwner((tx) => updatePublishPost(tx, { id, message: 'Đã sửa', scheduledAt: null }));
    expect(await rowOf(id)).toMatchObject({
      message: 'Đã sửa',
      status: 'draft',
      scheduled_at: null,
    });
    await asOwner((tx) => updatePublishPost(tx, { id, message: 'Đã sửa', scheduledAt: IN(600) }));
    expect((await rowOf(id)).status).toBe('scheduled');
  });
});

describe('kiểm tra đầu vào', () => {
  it('giờ cách dưới 2 phút hoặc quá 90 ngày, thiếu nội dung → 22023', async () => {
    const id = await scheduled();
    for (const [message, scheduledAt] of [
      ['x', IN(1)],
      ['x', IN(60 * 24 * 91)],
      ['   ', IN(600)],
    ] as const) {
      expect(
        await expectRejectCode(
          asOwner((tx) => updatePublishPost(tx, { id, message, scheduledAt })),
        ),
      ).toBe(INVALID);
    }
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          updatePublishPost(tx, { id, message: 'a'.repeat(63207), scheduledAt: null }),
        ),
      ),
    ).toBe(INVALID);
  });

  it('bài chưa có kênh không lên lịch được; kênh không còn connected → 22023', async () => {
    const noChannel = await asOwner((tx) => savePublishPost(tx, { message: 'x', channelIds: [] }));
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          updatePublishPost(tx, { id: noChannel, message: 'x', scheduledAt: IN(600) }),
        ),
      ),
    ).toBe(INVALID);
    const id = await scheduled();
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [expired]);
    const withExpired = await asOwner((tx) =>
      savePublishPost(tx, { message: 'x', channelIds: [expired] }),
    ).catch(() => null);
    void withExpired;
    await admin.query(
      'INSERT INTO cf.publish_post_targets (workspace_id, post_id, channel_id) VALUES ($1, $2, $3)',
      [ws, id, expired],
    );
    expect(
      await expectRejectCode(
        asOwner((tx) => updatePublishPost(tx, { id, message: 'x', scheduledAt: IN(900) })),
      ),
    ).toBe(INVALID);
  });
});

describe('quyền và trạng thái', () => {
  it('Staff không sửa được (42501); bài workspace khác → 55000', async () => {
    const id = await scheduled();
    expect(
      await expectRejectCode(
        app.withActor(ws, staff, (tx) =>
          updatePublishPost(tx, { id, message: 'x', scheduledAt: IN(600) }),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        app.withActor(other, otherOwner, (tx) =>
          updatePublishPost(tx, { id, message: 'x', scheduledAt: null }),
        ),
      ),
    ).toBe(NOT_EDITABLE);
  });

  it('bài đã đăng/đang đăng, hoặc có mục tiêu đã đi tiếp → 55000, không đổi gì', async () => {
    const id = await scheduled();
    await admin.query(
      "UPDATE cf.publish_post_targets SET status = 'publishing' WHERE post_id = $1",
      [id],
    );
    expect(
      await expectRejectCode(
        asOwner((tx) => updatePublishPost(tx, { id, message: 'đổi', scheduledAt: IN(600) })),
      ),
    ).toBe(NOT_EDITABLE);
    expect((await rowOf(id)).message).not.toBe('đổi');
    const done = await scheduled();
    await admin.query("UPDATE cf.publish_posts SET status = 'published' WHERE id = $1", [done]);
    expect(
      await expectRejectCode(
        asOwner((tx) => updatePublishPost(tx, { id: done, message: 'x', scheduledAt: null })),
      ),
    ).toBe(NOT_EDITABLE);
  });
});
