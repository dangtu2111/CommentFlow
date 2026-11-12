import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  cancelPublishSchedule,
  claimPublishTargets,
  deletePublishPost,
  getPublishPost,
  listDuePublishWorkspaces,
  listPublishDrafts,
  listPublishPostsForWeek,
  publishPostNow,
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
 * POST-PUBLISHING (migration 0090, Q-PUB1): Owner lưu/lên lịch/hủy/xóa/đăng ngay; CHỈ hệ thống (worker) nhận mục tiêu và ghi kết quả; tối đa MỘT lần;
 * thuê hết hạn → unknown (không tự đăng lại); workspace đang Dừng khẩn cấp thì không nhận; cô lập workspace; Staff/người lạ bị từ chối.
 */
const RLS = '42501';
const INVALID = '22023';
const NOT_EDITABLE = '55000';
const SOON = () => new Date(Date.now() + 10 * 60_000);

let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let fb1: string;
let fb2: string;
let ig: string;
let expired: string;
let otherChannel: string;

async function channel(
  workspaceId: string,
  platform: string,
  status = 'connected',
  scopes: string[] = [],
) {
  const r = await admin.query(
    'INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, scopes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [workspaceId, platform, `ext-${randomUUID()}`, `Page ${platform}`, status, scopes],
  );
  return r.rows[0].id as string;
}
const asOwner = <T>(fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>) =>
  app.withActor(ws, owner, fn);
const asSystem = <T>(fn: (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) => Promise<T>) =>
  worker.withJob(ws, fn);
const postRow = async (id: string) =>
  (
    await admin.query(
      'SELECT status, scheduled_at, published_at FROM cf.publish_posts WHERE id = $1',
      [id],
    )
  ).rows[0];
const targetRows = async (postId: string) =>
  (
    await admin.query(
      'SELECT id, status, attempts, error_code, external_post_id FROM cf.publish_post_targets WHERE post_id = $1 ORDER BY id',
      [postId],
    )
  ).rows;
const dueNow = (id: string) =>
  admin.query(
    "UPDATE cf.publish_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1",
    [id],
  );

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'pub-owner');
  staff = await seedUser(admin, 'pub-staff');
  otherOwner = await seedUser(admin, 'pub-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
  fb1 = await channel(ws, 'facebook', 'connected', ['pages_manage_posts']);
  fb2 = await channel(ws, 'facebook');
  ig = await channel(ws, 'instagram');
  expired = await channel(ws, 'facebook', 'expired');
  otherChannel = await channel(other, 'facebook');
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('quyền: chỉ Owner ghi; Staff/người lạ bị từ chối; web không đụng được hàm của worker', () => {
  it('Staff không lưu/hủy/xóa/đăng ngay được (42501); Owner lưu nháp được', async () => {
    const id = await asOwner((tx) => savePublishPost(tx, { message: 'nháp', channelIds: [fb1] }));
    for (const run of [
      () =>
        app.withActor(ws, staff, (tx) => savePublishPost(tx, { message: 'x', channelIds: [fb1] })),
      () => app.withActor(ws, staff, (tx) => cancelPublishSchedule(tx, id)),
      () => app.withActor(ws, staff, (tx) => deletePublishPost(tx, id)),
      () => app.withActor(ws, staff, (tx) => publishPostNow(tx, id)),
    ]) {
      expect(await expectRejectCode(run())).toBe(RLS);
    }
    expect((await postRow(id)).status).toBe('draft');
  });

  it('Staff và workspace khác không thấy bài (RLS); không UPDATE/INSERT trực tiếp được', async () => {
    const id = await asOwner((tx) => savePublishPost(tx, { message: 'riêng', channelIds: [] }));
    expect(await app.withActor(ws, staff, (tx) => getPublishPost(tx, ws, id))).toBeNull();
    expect(
      await app.withActor(other, otherOwner, (tx) => getPublishPost(tx, other, id)),
    ).toBeNull();
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          tx.execute(sql`UPDATE cf.publish_posts SET status = 'published' WHERE id = ${id}::uuid`),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          tx.execute(
            sql`INSERT INTO cf.publish_posts (workspace_id, message) VALUES (${ws}::uuid, 'x')`,
          ),
        ),
      ),
    ).toBe(RLS);
  });

  it('Owner (web) KHÔNG nhận mục tiêu, KHÔNG ghi kết quả; hàm liệt kê workspace chỉ cf_worker ngữ cảnh trần', async () => {
    expect(await expectRejectCode(asOwner((tx) => claimPublishTargets(tx, 5)))).toBe(RLS);
    expect(
      await expectRejectCode(
        asOwner((tx) => recordPublishResult(tx, randomUUID(), 'failed', { error: 'x' })),
      ),
    ).toBe(RLS);
    expect(await expectRejectCode(app.withSystem((tx) => listDuePublishWorkspaces(tx, 10)))).toBe(
      RLS,
    );
  });
});

describe('kiểm tra đầu vào khi lưu/lên lịch', () => {
  it('nội dung quá dài, kênh lạ/không Facebook/hết hạn, quá nhiều kênh → 22023', async () => {
    const bad = [
      { message: 'a'.repeat(63207), channelIds: [fb1] },
      { message: 'x', channelIds: [ig] },
      { message: 'x', channelIds: [expired] },
      { message: 'x', channelIds: [otherChannel] },
      { message: 'x', channelIds: [randomUUID()] },
    ];
    for (const input of bad) {
      expect(await expectRejectCode(asOwner((tx) => savePublishPost(tx, input)))).toBe(INVALID);
    }
  });

  it('lên lịch cần nội dung + kênh; giờ phải cách hiện tại 2 phút – 90 ngày', async () => {
    const at = SOON();
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          savePublishPost(tx, { message: '   ', channelIds: [fb1], scheduledAt: at }),
        ),
      ),
    ).toBe(INVALID);
    expect(
      await expectRejectCode(
        asOwner((tx) => savePublishPost(tx, { message: 'x', channelIds: [], scheduledAt: at })),
      ),
    ).toBe(INVALID);
    for (const scheduledAt of [
      new Date(Date.now() + 30_000),
      new Date(Date.now() - 3_600_000),
      new Date(Date.now() + 91 * 86_400_000),
    ]) {
      expect(
        await expectRejectCode(
          asOwner((tx) => savePublishPost(tx, { message: 'x', channelIds: [fb1], scheduledAt })),
        ),
      ).toBe(INVALID);
    }
  });

  it('nháp được trống và không kênh; lên lịch hợp lệ → scheduled kèm mục tiêu pending', async () => {
    const draft = await asOwner((tx) => savePublishPost(tx, { message: '', channelIds: [] }));
    expect((await postRow(draft)).status).toBe('draft');
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'Khai trương', channelIds: [fb1, fb2], scheduledAt: SOON() }),
    );
    expect((await postRow(id)).status).toBe('scheduled');
    expect((await targetRows(id)).map((t) => t.status)).toEqual(['pending', 'pending']);
  });
});

describe('sửa / hủy lịch / xóa', () => {
  it('sửa nháp thay nội dung và danh sách kênh; hủy lịch đưa về nháp; xóa nháp được', async () => {
    const id = await asOwner((tx) => savePublishPost(tx, { message: 'v1', channelIds: [fb1] }));
    await asOwner((tx) =>
      savePublishPost(tx, { id, message: 'v2', channelIds: [fb2], scheduledAt: SOON() }),
    );
    expect((await asOwner((tx) => getPublishPost(tx, ws, id)))?.message).toBe('v2');
    expect((await targetRows(id)).length).toBe(1);
    expect(await asOwner((tx) => cancelPublishSchedule(tx, id))).toBe(true);
    const back = await postRow(id);
    expect(back.status).toBe('draft');
    expect(back.scheduled_at).toBeNull();
    expect(await asOwner((tx) => cancelPublishSchedule(tx, id))).toBe(false);
    expect(await asOwner((tx) => deletePublishPost(tx, id))).toBe(true);
    expect(await asOwner((tx) => getPublishPost(tx, ws, id))).toBeNull();
  });

  it('không sửa/xóa được bài đang đăng hoặc đã đăng; sửa bài workspace khác → không tìm thấy', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'đi', channelIds: [fb1], scheduledAt: SOON() }),
    );
    await dueNow(id);
    const [claimed] = await asSystem((tx) => claimPublishTargets(tx, 5));
    expect(claimed).toBeDefined();
    expect(
      await expectRejectCode(
        asOwner((tx) => savePublishPost(tx, { id, message: 'sửa', channelIds: [fb1] })),
      ),
    ).toBe(NOT_EDITABLE);
    expect(await asOwner((tx) => deletePublishPost(tx, id))).toBe(false);
    expect(await asOwner((tx) => cancelPublishSchedule(tx, id))).toBe(false);
    await asSystem((tx) =>
      recordPublishResult(tx, claimed?.targetId as string, 'published', {
        externalPostId: '123_456',
      }),
    );
    expect((await postRow(id)).status).toBe('published');
    expect(await asOwner((tx) => deletePublishPost(tx, id))).toBe(false);
    const foreign = await asOwner((tx) =>
      savePublishPost(tx, { message: 'của ws', channelIds: [] }),
    );
    expect(
      await expectRejectCode(
        app.withActor(other, otherOwner, (tx) =>
          savePublishPost(tx, { id: foreign, message: 'x', channelIds: [] }),
        ),
      ),
    ).toBe(NOT_EDITABLE);
  });
});

describe('worker: nhận đúng một lần, ghi kết quả, tối đa một lần', () => {
  it('chưa đến hạn → không nhận; đến hạn → nhận kèm id Page, nội dung, quyền; nhận lần hai → rỗng', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'Hàng mới về', channelIds: [fb1], scheduledAt: SOON() }),
    );
    expect(await asSystem((tx) => claimPublishTargets(tx, 50))).not.toContainEqual(
      expect.objectContaining({ postId: id }),
    );
    await dueNow(id);
    const first = (await asSystem((tx) => claimPublishTargets(tx, 50))).filter(
      (c) => c.postId === id,
    );
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ message: 'Hàng mới về', channelId: fb1, attempts: 1 });
    expect(first[0]?.scopes).toContain('pages_manage_posts');
    expect((await postRow(id)).status).toBe('publishing');
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(0);
  });

  it('hai worker nhận song song KHÔNG nhận trùng cùng một mục tiêu', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'song song', channelIds: [fb1, fb2], scheduledAt: SOON() }),
    );
    await dueNow(id);
    const [a, b] = await Promise.all([
      asSystem((tx) => claimPublishTargets(tx, 50)),
      asSystem((tx) => claimPublishTargets(tx, 50)),
    ]);
    const mine = [...a, ...b].filter((c) => c.postId === id).map((c) => c.targetId);
    expect(mine).toHaveLength(2);
    expect(new Set(mine).size).toBe(2);
  });

  it('kết quả: published (kèm id) → bài published; chỉ ghi khi còn publishing — lần ghi thứ hai không đổi gì', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'một lần', channelIds: [fb1], scheduledAt: SOON() }),
    );
    await dueNow(id);
    const target = (await asSystem((tx) => claimPublishTargets(tx, 50))).find(
      (c) => c.postId === id,
    );
    expect(
      await asSystem((tx) =>
        recordPublishResult(tx, target?.targetId as string, 'published', {
          externalPostId: '999_111',
        }),
      ),
    ).toBe(true);
    expect(
      await asSystem((tx) =>
        recordPublishResult(tx, target?.targetId as string, 'failed', { error: 'late' }),
      ),
    ).toBe(false);
    const t = (await targetRows(id))[0];
    expect(t).toMatchObject({ status: 'published', external_post_id: '999_111', error_code: null });
    const post = await postRow(id);
    expect(post.status).toBe('published');
    expect(post.published_at).not.toBeNull();
  });

  it('nhiều kênh: một thành công một lỗi → partial; tất cả lỗi → failed; unknown không bao giờ được nhận lại', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'hai kênh', channelIds: [fb1, fb2], scheduledAt: SOON() }),
    );
    await dueNow(id);
    const claimed = (await asSystem((tx) => claimPublishTargets(tx, 50))).filter(
      (c) => c.postId === id,
    );
    await asSystem((tx) =>
      recordPublishResult(tx, claimed[0]?.targetId as string, 'published', {
        externalPostId: '1_1',
      }),
    );
    await asSystem((tx) =>
      recordPublishResult(tx, claimed[1]?.targetId as string, 'unknown', { error: 'network' }),
    );
    expect((await postRow(id)).status).toBe('partial');
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(0);

    const failedId = await asOwner((tx) =>
      savePublishPost(tx, { message: 'lỗi hết', channelIds: [fb1], scheduledAt: SOON() }),
    );
    await dueNow(failedId);
    const t = (await asSystem((tx) => claimPublishTargets(tx, 50))).find(
      (c) => c.postId === failedId,
    );
    await asSystem((tx) =>
      recordPublishResult(tx, t?.targetId as string, 'failed', { error: 'missing_permission' }),
    );
    expect((await postRow(failedId)).status).toBe('failed');
    expect(await asOwner((tx) => deletePublishPost(tx, failedId))).toBe(true);
  });

  it('retry (giới hạn tốc độ): quay về pending, nhận lại được tối đa 3 lần rồi dừng', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'thử lại', channelIds: [fb1], scheduledAt: SOON() }),
    );
    await dueNow(id);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claimed = (await asSystem((tx) => claimPublishTargets(tx, 50))).find(
        (c) => c.postId === id,
      );
      expect(claimed?.attempts, `lần ${attempt}`).toBe(attempt);
      await asSystem((tx) =>
        recordPublishResult(tx, claimed?.targetId as string, 'retry', { error: 'rate_limited' }),
      );
    }
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(0);
  });

  it('thuê hết hạn (publishing quá 15 phút) → unknown, KHÔNG tự đăng lại; bài không kẹt mãi ở publishing', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'kẹt', channelIds: [fb1], scheduledAt: SOON() }),
    );
    await dueNow(id);
    await asSystem((tx) => claimPublishTargets(tx, 50));
    await admin.query(
      "UPDATE cf.publish_post_targets SET claimed_at = now() - interval '16 minutes' WHERE post_id = $1",
      [id],
    );
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(0);
    expect((await targetRows(id))[0]).toMatchObject({
      status: 'unknown',
      error_code: 'lease_expired',
    });
    expect((await postRow(id)).status).toBe('failed');
  });

  it('kênh đã hết hạn/ngắt sau khi lên lịch → không nhận (không đăng bằng token hỏng)', async () => {
    const ch = await channel(ws, 'facebook');
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'kênh hỏng', channelIds: [ch], scheduledAt: SOON() }),
    );
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [ch]);
    await dueNow(id);
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(0);
  });
});

describe('Dừng khẩn cấp và liệt kê workspace đến hạn', () => {
  it('workspace đang dừng khẩn cấp: không được liệt kê và không nhận mục tiêu; bỏ dừng thì nhận lại', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'dừng khẩn cấp', channelIds: [fb1], scheduledAt: SOON() }),
    );
    await dueNow(id);
    expect(await worker.withSystem((tx) => listDuePublishWorkspaces(tx, 100))).toContain(ws);
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    expect(await worker.withSystem((tx) => listDuePublishWorkspaces(tx, 100))).not.toContain(ws);
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(0);
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = NULL WHERE id = $1', [ws]);
    expect(
      (await asSystem((tx) => claimPublishTargets(tx, 50))).filter((c) => c.postId === id),
    ).toHaveLength(1);
  });
});

describe('đăng ngay và truy vấn cho Lịch', () => {
  it('đăng ngay: draft → scheduled giờ = bây giờ; thiếu kênh/nội dung hoặc kênh không còn connected → 22023', async () => {
    const id = await asOwner((tx) => savePublishPost(tx, { message: 'ngay', channelIds: [fb1] }));
    expect(await asOwner((tx) => publishPostNow(tx, id))).toBe(true);
    const row = await postRow(id);
    expect(row.status).toBe('scheduled');
    expect(Date.now() - new Date(row.scheduled_at).getTime()).toBeLessThan(60_000);
    const empty = await asOwner((tx) =>
      savePublishPost(tx, { message: 'chưa có kênh', channelIds: [] }),
    );
    expect(await expectRejectCode(asOwner((tx) => publishPostNow(tx, empty)))).toBe(INVALID);
    const blank = await asOwner((tx) => savePublishPost(tx, { message: '  ', channelIds: [fb1] }));
    expect(await asOwner((tx) => publishPostNow(tx, blank))).toBe(false);
  });

  it('listPublishPostsForWeek đặt bài theo giờ đã lên lịch (múi giờ workspace) kèm mục tiêu; nháp nằm ở listPublishDrafts', async () => {
    const at = new Date('2026-12-02T03:30:00Z'); // 10:30 giờ Việt Nam
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'đặt lịch tuần', channelIds: [fb1], scheduledAt: at }),
    );
    await admin.query('UPDATE cf.publish_posts SET scheduled_at = $2 WHERE id = $1', [id, at]);
    const week = await asOwner((tx) =>
      listPublishPostsForWeek(tx, ws, '2026-11-30', 'Asia/Ho_Chi_Minh'),
    );
    const found = week.find((p) => p.id === id);
    expect(found).toMatchObject({ status: 'scheduled', day: '2026-12-02', time: '10:30' });
    expect(found?.targets.map((t) => t.status)).toEqual(['pending']);
    expect(
      (
        await asOwner((tx) => listPublishPostsForWeek(tx, ws, '2026-12-07', 'Asia/Ho_Chi_Minh'))
      ).some((p) => p.id === id),
    ).toBe(false);
    const draft = await asOwner((tx) =>
      savePublishPost(tx, { message: 'nháp lịch', channelIds: [] }),
    );
    expect((await asOwner((tx) => listPublishDrafts(tx, ws))).some((p) => p.id === draft)).toBe(
      true,
    );
    expect(week.some((p) => p.id === draft)).toBe(false);
  });

  it('nhật ký ghi mọi thay đổi và KHÔNG chứa nội dung bài', async () => {
    const logs = await admin.query(
      "SELECT action, after::text AS after FROM core.action_logs WHERE workspace_id = $1 AND target_type = 'publish_post'",
      [ws],
    );
    const actions = logs.rows.map((r) => r.action);
    for (const expected of [
      'publish_post.created',
      'publish_post.updated',
      'publish_post.schedule_cancelled',
      'publish_post.deleted',
      'publish_post.published',
      'publish_post.unknown',
    ]) {
      expect(actions, expected).toContain(expected);
    }
    for (const row of logs.rows)
      expect(String(row.after ?? '')).not.toMatch(/Khai trương|Hàng mới về|một lần/);
  });
});
