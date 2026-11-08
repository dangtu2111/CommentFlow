import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import type { PipelineJob } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runPipelineSweep } from '../src/jobs/pipeline-sweep';

/**
 * PIPE-ORCHESTRATOR lát E (Q-POR1, Q-POR7): job quét trên DB thật. Backfill KHÔNG BAO GIỜ được xếp; workspace dừng khẩn cấp bị
 * bỏ qua (bình luận giữ `new`); bỏ dừng thì xếp tiếp; bình luận kẹt `processing` hết thuê được xếp lại.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
const noLog = { info: () => {}, error: () => {} };

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 4 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

beforeEach(async () => {
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop quét',
    `shop-${ws}`,
  ]);
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
});

async function addComment(source: string, status = 'new', ageSeconds = 600): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source, created_time)
       VALUES ($1, $2, $3, $4, $5, 'x', $6, $7, now() - make_interval(secs => $8)) RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`, `u-${randomUUID()}`, status, source, ageSeconds],
    )
  ).rows[0].id as string;
}

function sweep(over: { allowed?: string[]; flag?: boolean } = {}) {
  const jobs: PipelineJob[] = [];
  const run = () =>
    runPipelineSweep({
      db,
      // Chỉ ghi nhận job của workspace của test (DB test dùng chung, còn dữ liệu của các test khác).
      enqueue: async (job) => {
        if (job.workspaceId === ws) jobs.push(job);
      },
      isEnabled: async (id) => (over.flag ?? true) && (over.allowed ?? [ws]).includes(id),
      logger: noLog,
    });
  return { jobs, run };
}

describe('job quét pipeline', () => {
  it('50 bình luận BACKFILL → sau 2 vòng quét: 0 job, 0 lượt bị trừ (FR-011)', async () => {
    for (let i = 0; i < 50; i += 1) await addComment('backfill');
    const s = sweep();
    await s.run();
    await s.run();
    expect(s.jobs).toHaveLength(0);
    const used = await admin.query(
      'SELECT coalesce(sum(used),0) n FROM core.usage_counters WHERE workspace_id = $1',
      [ws],
    );
    expect(Number(used.rows[0].n)).toBe(0);
  });

  it('bình luận webhook/polling kẹt `new` quá cửa sổ gộp → xếp job auto; còn mới (chưa quá cửa sổ) → chưa xếp', async () => {
    const old = await addComment('webhook');
    const polled = await addComment('polling');
    await addComment('webhook', 'new', 5);
    const s = sweep();
    await s.run();
    expect(s.jobs.map((j) => j.commentId).sort()).toEqual([old, polled].sort());
    expect(s.jobs.every((j) => j.trigger === 'auto')).toBe(true);
  });

  it('cờ tắt hoặc workspace ngoài danh sách → không xếp', async () => {
    await addComment('webhook');
    const off = sweep({ flag: false });
    await off.run();
    const other = sweep({ allowed: [randomUUID()] });
    await other.run();
    expect(off.jobs).toHaveLength(0);
    expect(other.jobs).toHaveLength(0);
  });

  it('DỪNG KHẨN CẤP: bình luận giữ new, 2 vòng quét 0 job (không xếp vô hạn); bỏ dừng → vòng sau xếp', async () => {
    const id = await addComment('webhook');
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    const s = sweep();
    await s.run();
    await s.run();
    expect(s.jobs).toHaveLength(0);
    expect(
      (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0].status,
    ).toBe('new');
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = NULL WHERE id = $1', [ws]);
    await s.run();
    expect(s.jobs.map((j) => j.commentId)).toEqual([id]);
  });

  it('bình luận backfill ĐÃ có lượt (nhân viên bấm "Soạn gợi ý") kẹt new → xếp job manual', async () => {
    const id = await addComment('backfill');
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts) VALUES ($1, $2, 'processing', 1)",
      [ws, id],
    );
    const s = sweep();
    await s.run();
    expect(s.jobs).toEqual([{ workspaceId: ws, commentId: id, trigger: 'manual' }]);
  });

  it('processing hết thuê quá 15 phút (job chết) → xếp lại; còn thuê hoặc mới → không', async () => {
    const dead = await addComment('webhook', 'processing');
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts, locked_until, updated_at) VALUES ($1, $2, 'processing', 1, now() - interval '20 minutes', now() - interval '20 minutes')",
      [ws, dead],
    );
    const live = await addComment('webhook', 'processing');
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts, locked_until) VALUES ($1, $2, 'processing', 1, now() + interval '1 minute')",
      [ws, live],
    );
    const s = sweep();
    await s.run();
    expect(s.jobs.map((j) => j.commentId)).toEqual([dead]);
  });

  it('workspace CHỈ còn một bình luận `processing` kẹt: cờ bật → xếp lại (không mất bình luận); cờ tắt → không xếp, bật lại thì xếp', async () => {
    const dead = await addComment('webhook', 'processing');
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts, locked_until, updated_at) VALUES ($1, $2, 'processing', 1, now() - interval '1 hour', now() - interval '1 hour')",
      [ws, dead],
    );
    const off = sweep({ flag: false });
    await off.run();
    expect(off.jobs).toHaveLength(0);
    const on = sweep();
    await on.run();
    expect(on.jobs.map((j) => j.commentId)).toEqual([dead]);
  });

  it('bình luận của Page / đã xóa / đã gộp không bao giờ được xếp', async () => {
    const own = await addComment('webhook');
    await admin.query('UPDATE cf.comments SET is_own = true WHERE id = $1', [own]);
    const del = await addComment('webhook');
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [del]);
    const main = await addComment('webhook', 'pending_review');
    const merged = await addComment('webhook');
    await admin.query('UPDATE cf.comments SET merged_into_id = $1 WHERE id = $2', [main, merged]);
    const s = sweep();
    await s.run();
    expect(s.jobs).toHaveLength(0);
  });
});
