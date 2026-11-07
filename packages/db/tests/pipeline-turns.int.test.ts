import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  beginPipelineTurn,
  blockPipelineTurn,
  completePipelineTurn,
  isWorkspaceEmergencyStopped,
  markPipelineTurnCharged,
  releasePipelineTurn,
} from '../src/queries/pipeline-turns';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * PIPE-ORCHESTRATOR lát C (Q-POR3): `cf.pipeline_turns` — khóa DUY NHẤT theo comment_id ở DB; giành quyền xử lý bằng cập nhật có điều kiện;
 * đếm lần thử; `charged_at` ghi một lần; hết lần thử → needs_human (không kẹt processing); RLS: thành viên chỉ đọc, hệ thống ghi.
 */
const RLS = '42501';
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let channel: string;
let post: string;

async function addComment(
  over: { status?: string; isOwn?: boolean; deletedAt?: Date | null; workspace?: string } = {},
) {
  const w = over.workspace ?? ws;
  const ch = over.workspace ? ((await mkChannel(w)) as string) : channel;
  const pst = over.workspace ? ((await mkPost(w, ch)) as string) : post;
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, is_own, deleted_at, ingest_source)
     VALUES ($1, $2, $3, $4, 'u1', 'Giá bao nhiêu?', $5, $6, $7, 'webhook') RETURNING id`,
    [
      w,
      ch,
      pst,
      `cm-${randomUUID()}`,
      over.status ?? 'new',
      over.isOwn ?? false,
      over.deletedAt ?? null,
    ],
  );
  return r.rows[0].id as string;
}
const mkChannel = async (w: string) =>
  (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P') RETURNING id",
      [w, `p-${randomUUID()}`],
    )
  ).rows[0].id as string;
const mkPost = async (w: string, ch: string) =>
  (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [w, ch, `post-${randomUUID()}`],
    )
  ).rows[0].id as string;

const statusOf = async (id: string) =>
  (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0]
    .status as string;
const turnOf = async (id: string) =>
  (await admin.query('SELECT * FROM cf.pipeline_turns WHERE comment_id = $1', [id])).rows;

// `leaseSeconds: 0` = không giữ thuê (mô phỏng lần thử lại SAU khi lần trước đã kết thúc); test thuê dùng giá trị thật.
const begin = (id: string, maxAttempts = 3, workspace = ws, leaseSeconds = 0) =>
  db.withJob(workspace, (tx) =>
    beginPipelineTurn(tx, workspace, id, { maxAttempts, leaseSeconds }),
  );

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(5);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  await seedMember(admin, ws, owner, 'owner');
  channel = await mkChannel(ws);
  post = await mkPost(ws, channel);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('beginPipelineTurn — giành quyền xử lý + khóa duy nhất + đếm lần thử', () => {
  it('lần đầu: giành quyền (new → processing), tạo đúng MỘT dòng khóa, attempts 1, chưa trừ lượt', async () => {
    const id = await addComment();
    const r = await begin(id);
    expect(r).toEqual({ outcome: 'claimed', attempts: 1, alreadyCharged: false });
    expect(await statusOf(id)).toBe('processing');
    const rows = await turnOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace_id: ws,
      attempts: 1,
      state: 'processing',
      charged_at: null,
    });
  });

  it('thử lại: vẫn MỘT dòng, attempts tăng; sau khi ghi đã trừ lượt thì alreadyCharged=true và charged_at không đổi', async () => {
    const id = await addComment();
    await begin(id);
    expect(await db.withJob(ws, (tx) => markPipelineTurnCharged(tx, ws, id))).toBe(true);
    const charged = (await turnOf(id))[0].charged_at as Date;
    expect(charged).not.toBeNull();
    const again = await begin(id);
    expect(again).toEqual({ outcome: 'claimed', attempts: 2, alreadyCharged: true });
    // Ghi trừ lượt lần hai không đổi gì.
    expect(await db.withJob(ws, (tx) => markPipelineTurnCharged(tx, ws, id))).toBe(false);
    const rows = await turnOf(id);
    expect(rows).toHaveLength(1);
    expect((rows[0].charged_at as Date).getTime()).toBe(charged.getTime());
  });

  it('charged_at là ghi-một-lần ở DB: sửa/xóa giá trị đã đặt bị trigger từ chối', async () => {
    const id = await addComment();
    await begin(id);
    await db.withJob(ws, (tx) => markPipelineTurnCharged(tx, ws, id));
    await expect(
      admin.query('UPDATE cf.pipeline_turns SET charged_at = NULL WHERE comment_id = $1', [id]),
    ).rejects.toThrow(/charged_at/);
    await expect(
      admin.query(
        "UPDATE cf.pipeline_turns SET charged_at = now() + interval '1 day' WHERE comment_id = $1",
        [id],
      ),
    ).rejects.toThrow(/charged_at/);
  });

  it('nhiều job đồng thời cùng bình luận (có thuê) → đúng MỘT dòng khóa, đúng MỘT job được xử lý, các job còn lại busy; attempts vẫn 1', async () => {
    const id = await addComment();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => begin(id, 3, ws, 120)));
    expect(results.filter((r) => r.outcome === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'busy')).toHaveLength(4);
    const rows = await turnOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(1);
    expect(await statusOf(id)).toBe('processing');
  });

  it('thuê: job trùng khi còn thuê → busy KHÔNG tăng attempts; thuê hết hạn → giành lại, attempts tăng', async () => {
    const id = await addComment();
    expect((await begin(id, 3, ws, 120)).outcome).toBe('claimed');
    expect(await begin(id, 3, ws, 120)).toEqual({ outcome: 'busy' });
    expect((await turnOf(id))[0].attempts).toBe(1);
    // crash cứng: không ai nhả thuê → hết hạn thì giành lại được và xử lý tiếp.
    await admin.query(
      "UPDATE cf.pipeline_turns SET locked_until = now() - interval '1 second' WHERE comment_id = $1",
      [id],
    );
    expect(await begin(id, 3, ws, 120)).toEqual({
      outcome: 'claimed',
      attempts: 2,
      alreadyCharged: false,
    });
  });

  it('nhả thuê khi job lỗi có kiểm soát → lần thử lại giành được ngay (không đợi hết hạn); hoàn tất/chặn cũng nhả thuê', async () => {
    const id = await addComment();
    await begin(id, 3, ws, 120);
    await db.withJob(ws, (tx) => releasePipelineTurn(tx, ws, id, 'llm_timeout'));
    expect((await turnOf(id))[0]).toMatchObject({
      locked_until: null,
      last_error: 'llm_timeout',
      state: 'processing',
    });
    expect((await begin(id, 3, ws, 120)).outcome).toBe('claimed');
    await db.withJob(ws, (tx) => completePipelineTurn(tx, ws, id));
    expect((await turnOf(id))[0]).toMatchObject({ locked_until: null, state: 'done' });
    const other2 = await addComment();
    await begin(other2, 3, ws, 120);
    await db.withJob(ws, (tx) => blockPipelineTurn(tx, ws, other2, 'quota_exhausted'));
    expect((await turnOf(other2))[0].locked_until).toBeNull();
  });

  it('bình luận không còn xử lý được → not_claimable, KHÔNG tạo dòng khóa, không đổi trạng thái', async () => {
    for (const over of [
      { status: 'pending_review' },
      { status: 'replied' },
      { isOwn: true },
      { deletedAt: new Date() },
    ]) {
      const id = await addComment(over);
      const before = await statusOf(id);
      expect(await begin(id)).toEqual({ outcome: 'not_claimable' });
      expect(await turnOf(id)).toHaveLength(0);
      expect(await statusOf(id)).toBe(before);
    }
    expect(await begin(randomUUID())).toEqual({ outcome: 'not_claimable' });
  });

  it('quá số lần thử → attempts_exhausted: bình luận sang needs_human (KHÔNG kẹt processing), khóa state=failed', async () => {
    const id = await addComment();
    expect((await begin(id, 2)).outcome).toBe('claimed');
    expect((await begin(id, 2)).outcome).toBe('claimed');
    expect(await begin(id, 2)).toEqual({ outcome: 'attempts_exhausted' });
    expect(await statusOf(id)).toBe('needs_human');
    expect((await turnOf(id))[0]).toMatchObject({ state: 'failed' });
    // Sau đó không còn giành lại được.
    expect(await begin(id, 2)).toEqual({ outcome: 'not_claimable' });
  });

  it('không giành quyền chéo workspace', async () => {
    const id = await addComment();
    expect(await begin(id, 3, other)).toEqual({ outcome: 'not_claimable' });
    expect(await turnOf(id)).toHaveLength(0);
  });
});

describe('blockPipelineTurn / completePipelineTurn', () => {
  it('chặn (hết lượt/dừng khẩn cấp): khóa state=blocked + lý do; bình luận needs_human', async () => {
    const id = await addComment();
    await begin(id);
    await db.withJob(ws, (tx) => blockPipelineTurn(tx, ws, id, 'quota_exhausted'));
    expect((await turnOf(id))[0]).toMatchObject({
      state: 'blocked',
      last_error: 'quota_exhausted',
    });
    expect(await statusOf(id)).toBe('needs_human');
  });

  it('hoàn tất: khóa state=done', async () => {
    const id = await addComment();
    await begin(id);
    await db.withJob(ws, (tx) => completePipelineTurn(tx, ws, id));
    expect((await turnOf(id))[0]).toMatchObject({ state: 'done' });
  });
});

describe('RLS pipeline_turns: thành viên chỉ ĐỌC, hệ thống ghi, workspace khác không thấy', () => {
  it('thành viên đọc được khóa của workspace mình; đường người dùng không ghi được; workspace khác không thấy', async () => {
    const id = await addComment();
    await begin(id);
    const seen = await db.withActor(ws, owner, (tx) =>
      tx.execute(`SELECT comment_id FROM cf.pipeline_turns WHERE comment_id = '${id}'` as never),
    );
    expect((seen as unknown as { rows: unknown[] }).rows).toHaveLength(1);
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            `INSERT INTO cf.pipeline_turns (workspace_id, comment_id) VALUES ('${ws}', '${randomUUID()}')` as never,
          ),
        ),
      ),
    ).toBe(RLS);
    const foreign = await db.withWorkspace(other, (tx) =>
      tx.execute(`SELECT comment_id FROM cf.pipeline_turns WHERE comment_id = '${id}'` as never),
    );
    expect((foreign as unknown as { rows: unknown[] }).rows).toHaveLength(0);
  });
});

describe('isWorkspaceEmergencyStopped', () => {
  it('đọc cờ dừng khẩn cấp của workspace (mặc định không dừng)', async () => {
    expect(await db.withJob(ws, (tx) => isWorkspaceEmergencyStopped(tx, ws))).toBe(false);
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    expect(await db.withJob(ws, (tx) => isWorkspaceEmergencyStopped(tx, ws))).toBe(true);
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = NULL WHERE id = $1', [ws]);
    expect(await db.withJob(ws, (tx) => isWorkspaceEmergencyStopped(tx, ws))).toBe(false);
  });

  it('workspace không tồn tại → coi như DỪNG (đóng khi lỗi, không "mở khi lỗi")', async () => {
    expect(await db.withJob(ws, (tx) => isWorkspaceEmergencyStopped(tx, randomUUID()))).toBe(true);
  });
});
