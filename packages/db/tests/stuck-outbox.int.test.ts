import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listStuckOutbox, type StuckOutboxKind } from '../src/stuck-outbox';
import {
  createAdminPool,
  createWebDb,
  createWorkerDb,
  expectRejectCode,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * SEND-SWEEP + HIDE-SWEEP (migration 0031, QSW1): hàm DEFINER `cf.list_stuck_outbox` — chỉ ĐỌC, chỉ trả id, chỉ chạy ở
 * NGỮ CẢNH TRẦN của kết nối `cf_worker`. Hàng đã seed cũ hơn mọi hàng của test khác (10 năm) để không lẫn trong lô giới hạn.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let staff: string;

const OPTIONS = { queuedAfterSeconds: 300, sendingAfterSeconds: 150, limit: 100 };
const list = (kind: StuckOutboxKind, options = OPTIONS) =>
  worker.withSystem((tx) => listStuckOutbox(tx, kind, options));

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  staff = await seedUser(admin);
  await seedMember(admin, wsA, staff, 'staff');
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close(), admin.end()]);
});

/** Một yêu cầu (kênh + bài + bình luận + yêu cầu) với `status` và tuổi `ageSeconds` (so với bây giờ). */
async function seedRequest(
  kind: StuckOutboxKind,
  ws: string,
  status: string,
  ageSeconds: number,
): Promise<string> {
  const channel = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', 'connected') RETURNING id",
    [ws, `page-${newId()}`],
  );
  const channelId = channel.rows[0].id as string;
  const post = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [ws, channelId, `post-${newId()}`],
  );
  const comment = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, status)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', 'Khách', 'Giá?', 'pending_review') RETURNING id`,
    [ws, channelId, post.rows[0].id, `cm-${newId()}`],
  );
  const commentId = comment.rows[0].id as string;
  const inserted =
    kind === 'reply'
      ? await admin.query(
          `INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, previous_status, status, updated_at)
           VALUES ($1, $2, $3, 'Dạ còn ạ', 'pending_review', $4, now() - make_interval(secs => $5)) RETURNING id`,
          [ws, channelId, commentId, status, ageSeconds],
        )
      : await admin.query(
          `INSERT INTO cf.comment_hides (workspace_id, channel_id, comment_id, action, previous_status, status, updated_at)
           VALUES ($1, $2, $3, 'hide', 'pending_review', $4, now() - make_interval(secs => $5)) RETURNING id`,
          [ws, channelId, commentId, status, ageSeconds],
        );
  return inserted.rows[0].id as string;
}

const TEN_YEARS = 10 * 365 * 24 * 3600;

describe.each(['reply', 'hide'] as const)(
  'SEND-SWEEP/HIDE-SWEEP: cf.list_stuck_outbox (%s)',
  (kind) => {
    it('trả `queued` quá ngưỡng và `sending` quá ngưỡng thuê, kèm workspace; KHÔNG trả dòng còn mới hay đã kết thúc', async () => {
      const queuedOld = await seedRequest(kind, wsA, 'queued', TEN_YEARS);
      const sendingOld = await seedRequest(kind, wsB, 'sending', TEN_YEARS + 1);
      const queuedFresh = await seedRequest(kind, wsA, 'queued', 100);
      // `sending` 200 giây: quá hạn thuê (150) → kẹt; `queued` 200 giây: chưa quá 300 → CHƯA kẹt.
      const sendingStale = await seedRequest(kind, wsA, 'sending', 200);
      const queuedNotYet = await seedRequest(kind, wsA, 'queued', 200);
      const sendingFresh = await seedRequest(kind, wsA, 'sending', 30);
      const finished = await Promise.all(
        (kind === 'reply' ? ['sent', 'failed', 'cancelled'] : ['done', 'failed', 'cancelled']).map(
          (status) => seedRequest(kind, wsA, status, TEN_YEARS),
        ),
      );

      const found = await list(kind);
      const ids = new Map(found.map((row) => [row.requestId, row.workspaceId]));
      expect(ids.get(queuedOld)).toBe(wsA);
      expect(ids.get(sendingOld)).toBe(wsB);
      expect(ids.get(sendingStale)).toBe(wsA);
      for (const id of [queuedFresh, queuedNotYet, sendingFresh, ...finished]) {
        expect(ids.has(id)).toBe(false);
      }
      // Cũ nhất trước.
      expect(found.findIndex((r) => r.requestId === queuedOld)).toBeLessThan(
        found.findIndex((r) => r.requestId === sendingStale),
      );
    });

    it('chỉ trả (workspaceId, requestId) — không lộ cột nào khác', async () => {
      await seedRequest(kind, wsA, 'queued', TEN_YEARS);
      const raw = await worker.withSystem((tx) =>
        tx.execute(sql`SELECT * FROM cf.list_stuck_outbox(${kind}::text, 300, 150, 5)`),
      );
      expect(Object.keys(raw.rows[0] ?? {}).sort()).toEqual(['request_id', 'workspace_id']);
    });

    it('p_limit giới hạn số dòng (kẹp 1..500)', async () => {
      await Promise.all([1, 2, 3].map(() => seedRequest(kind, wsA, 'queued', TEN_YEARS)));
      expect(await list(kind, { ...OPTIONS, limit: 2 })).toHaveLength(2);
      expect((await list(kind, { ...OPTIONS, limit: 0 })).length).toBe(1);
      expect((await list(kind, { ...OPTIONS, limit: 100000 })).length).toBeLessThanOrEqual(500);
    });
  },
);

describe('SEND-SWEEP/HIDE-SWEEP: quyền của cf.list_stuck_outbox', () => {
  it('cf_app (web) bị từ chối ở mọi ngữ cảnh: trần, workspace, người dùng', async () => {
    const call = (tx: Parameters<Parameters<FlowDb['withSystem']>[0]>[0]) =>
      listStuckOutbox(tx, 'reply', OPTIONS);
    expect(await expectRejectCode(web.withSystem(call))).toBe('42501');
    expect(await expectRejectCode(web.withWorkspace(wsA, call))).toBe('42501');
    expect(await expectRejectCode(web.withActor(wsA, staff, call))).toBe('42501');
    expect(await expectRejectCode(web.withUser(staff, call))).toBe('42501');
  });

  it('cf_worker bị từ chối khi có workspace/người dùng (job hệ thống, actor) — chỉ ngữ cảnh trần', async () => {
    const call = (tx: Parameters<Parameters<FlowDb['withSystem']>[0]>[0]) =>
      listStuckOutbox(tx, 'reply', OPTIONS);
    expect(await expectRejectCode(worker.withJob(wsA, call))).toBe('42501');
    expect(await expectRejectCode(worker.withWorkspace(wsA, call))).toBe('42501');
    expect(await expectRejectCode(worker.withActor(wsA, staff, call))).toBe('42501');
    expect(await expectRejectCode(worker.withUser(staff, call))).toBe('42501');
  });

  it('web tự đặt app.ctx = system vẫn bị từ chối (cf_app không có EXECUTE)', async () => {
    const code = await expectRejectCode(
      web.withSystem(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.ctx', 'system', true)`);
        return listStuckOutbox(tx, 'hide', OPTIONS);
      }),
    );
    expect(code).toBe('42501');
  });

  it('đối số sai bị từ chối (22023): loại lạ, số âm, thiếu', async () => {
    const bad = (query: ReturnType<typeof sql>) =>
      expectRejectCode(worker.withSystem((tx) => tx.execute(query)));
    expect(await bad(sql`SELECT * FROM cf.list_stuck_outbox('other', 300, 150, 10)`)).toBe('22023');
    expect(await bad(sql`SELECT * FROM cf.list_stuck_outbox('reply', -1, 150, 10)`)).toBe('22023');
    expect(await bad(sql`SELECT * FROM cf.list_stuck_outbox('reply', 300, -1, 10)`)).toBe('22023');
    expect(await bad(sql`SELECT * FROM cf.list_stuck_outbox(NULL, 300, 150, 10)`)).toBe('22023');
    expect(await bad(sql`SELECT * FROM cf.list_stuck_outbox('reply', 300, 150, NULL)`)).toBe(
      '22023',
    );
  });
});
