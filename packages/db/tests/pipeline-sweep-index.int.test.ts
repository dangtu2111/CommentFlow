import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  listPendingPipelineComments,
  listWorkspacesWithPendingPipelineComments,
} from '../src/queries/pipeline-merge';
import { createAdminPool, createWebDb, createWorkerDb, newId, seedWorkspace } from './helpers';

/**
 * PIPE-ORCHESTRATOR (migration 0075): job quét không được quét toàn bảng khi có hàng chục nghìn bình luận backfill. Seed ~50k
 * backfill giả lập + ít bình luận chờ thật; kiểm kết quả đúng VÀ kế hoạch truy vấn dùng chỉ mục một phần.
 */
let admin: pg.Pool;
let worker: FlowDb;
let ws: string;
const BACKFILL = 50_000;
let waiting: string[] = [];
let turnBackfill: string;

beforeAll(async () => {
  admin = createAdminPool();
  worker = createWorkerDb();
  ws = await seedWorkspace(admin);
  const channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P') RETURNING id",
      [ws, `p-${newId()}`],
    )
  ).rows[0].id;
  const post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${newId()}`],
    )
  ).rows[0].id;
  // ~50k bình luận nhập ngược (status new, cũ, KHÔNG bao giờ tự chạy).
  // Chia lô nhỏ: một câu lệnh 50k dòng làm cạn bảng khóa dùng chung của Postgres (trigger khóa theo dòng).
  const BATCH = 2_500;
  for (let from = 1; from <= BACKFILL; from += BATCH) {
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source, created_time)
       SELECT $1, $2, $3, 'bf-' || g, 'u' || (g % 500), 'cũ', 'new', 'backfill', now() - make_interval(secs => 100000 + g)
         FROM generate_series($4::int, $5::int) g`,
      [ws, channel, post, from, from + BATCH - 1],
    );
  }
  // Bình luận chờ thật (webhook/polling, quá hạn) và một bình luận backfill ĐÃ có lượt (nhân viên bấm).
  const ins = async (source: string, secsAgo: number) =>
    (
      await admin.query(
        `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source, created_time)
         VALUES ($1, $2, $3, $4, 'ux', 'x', 'new', $5, now() - make_interval(secs => $6)) RETURNING id`,
        [ws, channel, post, `c-${newId()}`, source, secsAgo],
      )
    ).rows[0].id as string;
  waiting = [await ins('webhook', 900), await ins('polling', 800)];
  await ins('webhook', 5); // chưa quá hạn
  turnBackfill = await ins('backfill', 700);
  await admin.query(
    "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts) VALUES ($1, $2, 'processing', 1)",
    [ws, turnBackfill],
  );
  await admin.query('ANALYZE cf.comments');
}, 120_000);

afterAll(async () => {
  // Dọn theo lô (xóa một lượt 50k dòng cạn bảng khóa dùng chung) để không để lại 50k dòng sau mỗi lần chạy.
  for (;;) {
    const r = await admin.query(
      'DELETE FROM cf.comments WHERE ctid IN (SELECT ctid FROM cf.comments WHERE workspace_id = $1 LIMIT 2500)',
      [ws],
    );
    if (!r.rowCount) break;
  }
  await admin.end();
  await worker.close();
});

const opts = () => ({
  newAfterSeconds: 90,
  processingAfterSeconds: 900,
  workspaceIds: [ws],
  limit: 500,
});

describe('job quét với 50k bình luận backfill (0075)', () => {
  it('trả đúng: 2 bình luận chờ + 1 backfill đã có lượt; KHÔNG trả backfill chưa có lượt', async () => {
    const rows = (await worker.withSystem((tx) => listPendingPipelineComments(tx, opts()))).filter(
      (r) => r.workspaceId === ws,
    );
    expect(rows.map((r) => r.commentId).sort()).toEqual([...waiting, turnBackfill].sort());
    expect(rows.find((r) => r.commentId === turnBackfill)?.hasTurn).toBe(true);
    expect(rows.filter((r) => r.ingestSource === 'backfill')).toHaveLength(1);
  });

  it('kế hoạch truy vấn nhánh A dùng CHỈ MỤC MỘT PHẦN, không quét tuần tự bảng bình luận', async () => {
    const plan = (
      await admin.query(
        `EXPLAIN (FORMAT JSON)
         SELECT c.id FROM cf.comments c
          WHERE c.status = 'new' AND c.ingest_source <> 'backfill' AND c.workspace_id = ANY ($1::uuid[])
            AND c.is_own = false AND c.deleted_at IS NULL AND c.merged_into_id IS NULL
            AND coalesce(c.created_time, c.created_at) < now() - make_interval(secs => 90)
          ORDER BY coalesce(c.created_time, c.created_at), c.id LIMIT 200`,
        [`{${ws}}`],
      )
    ).rows[0]['QUERY PLAN'];
    const text = JSON.stringify(plan);
    expect(text).toContain('comments_pipeline_pending_idx');
    expect(text).not.toContain('"Seq Scan"');
  });

  it('chạy nhanh: một lượt quét < 2 giây dù có 50k backfill', async () => {
    const started = Date.now();
    await worker.withSystem((tx) => listPendingPipelineComments(tx, opts()));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('workspace có bình luận chờ quét (0081) — đầu vào để lọc bằng cờ cf.pipeline.v2', () => {
  it('trả workspace có bình luận `new` quá hạn không backfill; KHÔNG trả workspace chỉ có backfill/chưa quá hạn', async () => {
    const quiet = await seedWorkspace(admin);
    const ids = await worker.withSystem((tx) =>
      listWorkspacesWithPendingPipelineComments(tx, {
        newAfterSeconds: 90,
        processingAfterSeconds: 900,
        limit: 500,
      }),
    );
    expect(ids).toContain(ws);
    expect(ids).not.toContain(quiet);
  });

  it('workspace dừng khẩn cấp không được trả; chỉ cf_worker ở ngữ cảnh trần gọi được', async () => {
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    try {
      const ids = await worker.withSystem((tx) =>
        listWorkspacesWithPendingPipelineComments(tx, {
          newAfterSeconds: 90,
          processingAfterSeconds: 900,
          limit: 500,
        }),
      );
      expect(ids).not.toContain(ws);
      const web = createWebDb();
      try {
        await expect(
          web.withSystem((tx) =>
            listWorkspacesWithPendingPipelineComments(tx, {
              newAfterSeconds: 90,
              processingAfterSeconds: 900,
              limit: 10,
            }),
          ),
        ).rejects.toThrow();
      } finally {
        await web.close();
      }
    } finally {
      await admin.query('UPDATE core.workspaces SET emergency_stopped_at = NULL WHERE id = $1', [
        ws,
      ]);
    }
  });
});

describe('hàm liệt kê workspace bao CẢ HAI nhánh của hàm quét gốc (0082)', () => {
  const list = (limit = 500) =>
    worker.withSystem((tx) =>
      listWorkspacesWithPendingPipelineComments(tx, {
        newAfterSeconds: 90,
        processingAfterSeconds: 900,
        limit,
      }),
    );
  const seedOnly = async (status: string, state: 'processing' | null) => {
    const w = await seedWorkspace(admin);
    const ch = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'P') RETURNING id",
        [w, `p-${newId()}`],
      )
    ).rows[0].id;
    const post = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [w, ch, `post-${newId()}`],
      )
    ).rows[0].id;
    const c = (
      await admin.query(
        `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source, created_time)
         VALUES ($1, $2, $3, $4, 'u', 'x', $5, 'webhook', now() - interval '2 hours') RETURNING id`,
        [w, ch, post, `c-${newId()}`, status],
      )
    ).rows[0].id as string;
    if (state) {
      await admin.query(
        `INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts, locked_until, updated_at)
         VALUES ($1, $2, $3, 1, now() - interval '1 hour', now() - interval '1 hour')`,
        [w, c, state],
      );
    }
    return { w, c };
  };

  it('workspace CHỈ có 1 bình luận `processing` kẹt (job chết) vẫn được liệt kê và hàm quét gốc trả đúng bình luận đó', async () => {
    const { w, c } = await seedOnly('processing', 'processing');
    expect(await list()).toContain(w);
    const rows = await worker.withSystem((tx) =>
      listPendingPipelineComments(tx, {
        newAfterSeconds: 90,
        processingAfterSeconds: 900,
        workspaceIds: [w],
        limit: 10,
      }),
    );
    // Nhánh B của hàm gốc không giới hạn theo danh sách workspace nên còn trả lượt của workspace khác trong DB test dùng chung.
    expect(rows.filter((r) => r.workspaceId === w).map((r) => r.commentId)).toEqual([c]);
  });

  it('workspace chỉ có bình luận `new` ĐÃ có lượt (nhân viên bấm "Soạn gợi ý") cũng được liệt kê', async () => {
    const { w } = await seedOnly('new', 'processing');
    expect(await list()).toContain(w);
  });

  it('không kẹt (`processing` còn thuê) thì không liệt kê', async () => {
    const { w, c } = await seedOnly('processing', 'processing');
    await admin.query(
      "UPDATE cf.pipeline_turns SET locked_until = now() + interval '1 hour', updated_at = now() WHERE comment_id = $1",
      [c],
    );
    expect(await list()).not.toContain(w);
  });

  it('workspace chờ CŨ NHẤT đứng đầu trước khi LIMIT (không bị bỏ đói)', async () => {
    const oldest = await seedOnly('new', null);
    await admin.query(
      "UPDATE cf.comments SET created_time = now() - interval '30 days' WHERE id = $1",
      [oldest.c],
    );
    const ids = await list(1);
    expect(ids).toEqual([oldest.w]);
  });
});
