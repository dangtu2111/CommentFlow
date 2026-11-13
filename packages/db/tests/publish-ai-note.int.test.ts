import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  claimPublishTargets,
  getPublishPostNote,
  recordPublishResult,
  savePublishPost,
} from '../src/publish-posts';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * COMPOSER-AI-NOTE (migration 0094, Q-PUB5): Owner viết ghi chú riêng cho AI khi soạn; khi bài ĐĂNG THÀNH CÔNG, ghi chú thành `cf.post_notes` của bài trên Facebook
 * (pipeline AI đọc ghi chú còn hiệu lực). Staff bị từ chối; ghi chú ≤ 1000 ký tự; ghi chú rỗng = xóa; lỗi gắn ghi chú không làm hỏng kết quả đăng.
 */
const RLS = '42501';
const INVALID = '22022';
const TOO_LONG = '22023';

let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let owner: string;
let staff: string;
let fb: string;

const asOwner = <T>(fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>) =>
  app.withActor(ws, owner, fn);
const asSystem = <T>(fn: (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) => Promise<T>) =>
  worker.withJob(ws, fn);
const SOON = () => new Date(Date.now() + 10 * 60_000);

async function publish(aiNote: string | null, externalId: string) {
  const id = await asOwner((tx) =>
    savePublishPost(tx, { message: 'Bài thử', channelIds: [fb], scheduledAt: SOON(), aiNote }),
  );
  await admin.query(
    "UPDATE cf.publish_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1",
    [id],
  );
  const target = (await asSystem((tx) => claimPublishTargets(tx, 50))).find((c) => c.postId === id);
  return asSystem((tx) =>
    recordPublishResult(tx, target?.targetId as string, 'published', {
      externalPostId: externalId,
    }),
  );
}
const notesOf = async (externalId: string) =>
  (
    await admin.query(
      `SELECT n.content, n.valid_to FROM cf.post_notes n JOIN cf.posts p ON p.id = n.post_id WHERE p.external_id = $1`,
      [externalId],
    )
  ).rows;

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'note-owner');
  staff = await seedUser(admin, 'note-staff');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, scopes) VALUES ($1, 'facebook', $2, 'Page', 'connected', ARRAY['pages_manage_posts']) RETURNING id",
    [ws, `ext-${randomUUID()}`],
  );
  fb = ch.rows[0].id;
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('đặt ghi chú khi soạn', () => {
  it('lưu, đọc lại, sửa; chuẩn hóa khoảng trắng; rỗng hoặc null = xóa', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'x', channelIds: [], aiNote: '  Ưu tiên combo  ' }),
    );
    expect(await asOwner((tx) => getPublishPostNote(tx, ws, id))).toBe('Ưu tiên combo');
    await asOwner((tx) => savePublishPost(tx, { id, message: 'x', channelIds: [], aiNote: 'Mới' }));
    expect(await asOwner((tx) => getPublishPostNote(tx, ws, id))).toBe('Mới');
    await asOwner((tx) => savePublishPost(tx, { id, message: 'x', channelIds: [], aiNote: '   ' }));
    expect(await asOwner((tx) => getPublishPostNote(tx, ws, id))).toBeNull();
    await asOwner((tx) => savePublishPost(tx, { id, message: 'x', channelIds: [], aiNote: 'Lại' }));
    await asOwner((tx) => savePublishPost(tx, { id, message: 'x', channelIds: [] }));
    expect(await asOwner((tx) => getPublishPostNote(tx, ws, id))).toBeNull();
  });

  it('quá 1000 ký tự → 22023; Staff không đặt được (42501)', async () => {
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          savePublishPost(tx, { message: 'x', channelIds: [], aiNote: 'a'.repeat(1001) }),
        ),
      ),
    ).toBe(TOO_LONG);
    expect(
      await expectRejectCode(
        app.withActor(ws, staff, (tx) =>
          savePublishPost(tx, { message: 'x', channelIds: [], aiNote: 'x' }),
        ),
      ),
    ).toBe(RLS);
    void INVALID;
  });
});

describe('đăng thành công → ghi chú của bài', () => {
  it('chỉ có ghi chú (không sản phẩm) vẫn tạo cf.posts và post_notes còn hiệu lực', async () => {
    expect(await publish('Nhắc chính sách đổi trả 7 ngày', 'ext_note_1')).toBe(true);
    const rows = await notesOf('ext_note_1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ content: 'Nhắc chính sách đổi trả 7 ngày', valid_to: null });
  });

  it('không có ghi chú và không sản phẩm → không tạo cf.posts; ghi chú cũ giống hệt không bị nhân đôi', async () => {
    expect(await publish(null, 'ext_note_2')).toBe(true);
    const none = await admin.query("SELECT 1 FROM cf.posts WHERE external_id = 'ext_note_2'");
    expect(none.rows).toHaveLength(0);
    const pre = await admin.query(
      "INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ($1, $2, 'ext_note_3', 'webhook') RETURNING id",
      [ws, fb],
    );
    await admin.query(
      'INSERT INTO cf.post_notes (workspace_id, post_id, content) VALUES ($1, $2, $3)',
      [ws, pre.rows[0].id, 'Ghi chú trùng'],
    );
    expect(await publish('Ghi chú trùng', 'ext_note_3')).toBe(true);
    expect(await notesOf('ext_note_3')).toHaveLength(1);
  });
});
