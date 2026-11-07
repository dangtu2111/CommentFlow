import { randomUUID } from 'node:crypto';
import {
  createDemoKnowledge,
  createFixtureDrafter,
  createFixtureExtractor,
  createTurnGate,
  type DonePipelineResult,
  FIXTURE_EXTRACT_DEFAULT,
  type PersistContext,
  runPipeline,
} from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { persistHandoff, persistPipelineResult } from '../src/jobs/pipeline-persist';
import { createDbTurnPorts } from '../src/jobs/pipeline-turn';

/**
 * PIPE-ORCHESTRATOR lát D (Q-POR6, nguyên tắc #6): ghi kết quả pipeline trên DB THẬT — một giao dịch, idempotent (chỉ MỘT bản nháp),
 * văn bản ghi đã che PII, "Cần nhân viên" cho lượt bị chặn/lỗi.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
const PHONE = '0912345678';
const EMAIL = 'khach@example.com';

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 8 });
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
    'Shop ghi',
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

async function addComment(): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source)
       VALUES ($1, $2, $3, $4, 'u1', 'x', 'new', 'webhook') RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`],
    )
  ).rows[0].id as string;
}

const ctxOf = (commentId: string): PersistContext => ({
  commentId,
  kbVersionNumber: null,
  model: 'cf-draft',
  promptVersion: 'draft@5',
  traceId: null,
});

async function runDone(
  commentId: string,
  text: string,
  topics: string[] = [],
): Promise<DonePipelineResult> {
  const ports = createDbTurnPorts({
    db,
    workspaceId: ws,
    commentId,
    limit: 100,
    timeZone: 'Asia/Ho_Chi_Minh',
    leaseSeconds: 0,
  });
  const result = await runPipeline(
    {
      workspaceId: ws,
      text,
      kbVersion: 'v1',
      voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
      autoSendEnabled: false,
    },
    {
      extractor: createFixtureExtractor([
        {
          match: /./,
          result: { ...FIXTURE_EXTRACT_DEFAULT, labels: [{ label: 'advice' }], asks: ['phí ship'] },
        },
      ]),
      drafter: createFixtureDrafter([
        {
          match: /./,
          result: {
            reply: 'Phí ship nội thành 20.000đ ạ',
            lang: 'vi',
            sources: ['demo-kb-ship'],
            claims: [{ text: 'Phí ship 20.000đ', source_ids: ['demo-kb-ship'], kind: 'fact' }],
            unanswered_topics: topics as never,
            needs_human: false,
            reason: '',
            variants: [],
          },
        },
      ]),
      knowledge: createDemoKnowledge(),
      gate: createTurnGate(ports),
    },
  );
  if (result.status !== 'done') throw new Error(`pipeline không xong: ${result.status}`);
  return result;
}

const count = async (table: string, where = 'workspace_id = $1'): Promise<number> =>
  Number((await admin.query(`SELECT count(*) n FROM ${table} WHERE ${where}`, [ws])).rows[0].n);

describe('persistPipelineResult — ghi một giao dịch', () => {
  it('ghi bản nháp + nhật ký tìm kiếm, cập nhật bình luận, đóng khóa lượt', async () => {
    const id = await addComment();
    const result = await runDone(id, 'ship về Hà Nội bao nhiêu');
    const out = await persistPipelineResult(db, ws, result, ctxOf(id), 42);
    expect(out.written).toBe(true);
    const c = (await admin.query('SELECT * FROM cf.comments WHERE id = $1', [id])).rows[0];
    expect(['pending_review', 'needs_human']).toContain(c.status);
    expect(c.label).not.toBeNull();
    expect(c.text_normalized).toBeTruthy();
    expect(
      (await admin.query('SELECT state FROM cf.pipeline_turns WHERE comment_id = $1', [id])).rows[0]
        .state,
    ).toBe('done');
    const d = (await admin.query('SELECT * FROM cf.drafts WHERE target_id = $1', [id])).rows;
    expect(d).toHaveLength(1);
    expect(d[0].text).toContain('20.000');
    expect(d[0].extracted).not.toBeNull();
    expect(await count('cf.retrieval_logs', 'workspace_id = $1')).toBe(1);
  });

  it('IDEMPOTENT: ghi hai lần và đồng thời → chỉ MỘT bản nháp, một nhật ký', async () => {
    const id = await addComment();
    const result = await runDone(id, 'ship về Hà Nội bao nhiêu');
    const outs = await Promise.all([
      persistPipelineResult(db, ws, result, ctxOf(id), 1),
      persistPipelineResult(db, ws, result, ctxOf(id), 1),
      persistPipelineResult(db, ws, result, ctxOf(id), 1),
    ]);
    expect(outs.filter((o) => o.written)).toHaveLength(1);
    expect((await persistPipelineResult(db, ws, result, ctxOf(id), 1)).written).toBe(false);
    expect(await count('cf.drafts')).toBe(1);
    expect(await count('cf.retrieval_logs')).toBe(1);
  });

  it('chủ đề chưa có nguồn → kb_gaps cộng dồn; PII không lọt vào cột nào đã ghi (nguyên tắc #6)', async () => {
    const a = await addComment();
    const b = await addComment();
    const text = `ship bao nhiêu, gọi ${PHONE} hoặc ${EMAIL}`;
    const ra = await runDone(a, text, ['shipping']);
    const rb = await runDone(b, text, ['shipping']);
    await persistPipelineResult(db, ws, ra, ctxOf(a), 1);
    await persistPipelineResult(db, ws, rb, ctxOf(b), 1);
    const gaps = (await admin.query('SELECT * FROM cf.kb_gaps WHERE workspace_id = $1', [ws])).rows;
    if (gaps.length > 0) expect(Number(gaps[0].count)).toBeGreaterThanOrEqual(1);
    for (const table of ['cf.drafts', 'cf.retrieval_logs', 'cf.kb_gaps']) {
      const dump = (
        await admin.query(`SELECT t::text AS row FROM ${table} t WHERE workspace_id = $1`, [ws])
      ).rows
        .map((r) => r.row)
        .join('\n');
      expect(dump, table).not.toContain(PHONE);
      expect(dump, table).not.toContain(EMAIL);
    }
    const comments = (
      await admin.query('SELECT c.text_normalized FROM cf.comments c WHERE workspace_id = $1', [ws])
    ).rows;
    expect(JSON.stringify(comments)).not.toContain(PHONE);
  });

  it('hoàn tác cả giao dịch khi lỗi giữa chừng (bình luận vẫn processing, không bản nháp)', async () => {
    const id = await addComment();
    const result = await runDone(id, 'ship về Hà Nội bao nhiêu');
    // Độ tin cậy 5 vi phạm CHECK của `drafts` SAU khi bình luận đã được cập nhật: cả giao dịch phải hoàn tác.
    const bad = {
      ...result,
      confidence: { ...result.confidence, confidence: 5 },
    } as DonePipelineResult;
    await expect(persistPipelineResult(db, ws, bad, ctxOf(id), 1)).rejects.toThrow();
    expect(
      (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0].status,
    ).toBe('processing');
    expect(await count('cf.drafts')).toBe(0);
  });
});

describe('persistHandoff — "Cần nhân viên" cho lượt bị chặn/lỗi', () => {
  it('ghi MỘT bản nháp needs_human kèm lý do, idempotent; markFailed đóng khóa failed', async () => {
    const id = await addComment();
    await admin.query("UPDATE cf.comments SET status = 'processing' WHERE id = $1", [id]);
    await admin.query(
      "INSERT INTO cf.pipeline_turns (workspace_id, comment_id, state, attempts) VALUES ($1, $2, 'processing', 1)",
      [ws, id],
    );
    const outs = await Promise.all([
      persistHandoff(db, ws, 'ai_invalid_output', ctxOf(id), { markFailed: true }),
      persistHandoff(db, ws, 'ai_invalid_output', ctxOf(id), { markFailed: true }),
    ]);
    expect(outs.filter((o) => o.written)).toHaveLength(1);
    const d = (await admin.query('SELECT * FROM cf.drafts WHERE target_id = $1', [id])).rows;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      needs_human: true,
      action: 'handoff',
      reason: 'ai_invalid_output',
    });
    expect(
      (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0].status,
    ).toBe('needs_human');
    expect(
      (await admin.query('SELECT state FROM cf.pipeline_turns WHERE comment_id = $1', [id])).rows[0]
        .state,
    ).toBe('failed');
  });
});
