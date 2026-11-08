import { randomUUID } from 'node:crypto';
import {
  createFixtureDrafter,
  createFixtureExtractor,
  createLlmDepsFromEnv,
  FIXTURE_EXTRACT_DEFAULT,
} from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PipelineJobConfig, runPipelineJob } from '../src/jobs/pipeline-job';

/**
 * PIPE-ORCHESTRATOR lát E: handler `pipeline` một bình luận trên DB thật — ngữ cảnh thật → kiến thức DÙNG CHUNG → cổng lượt →
 * ghi; đường tự động tôn trọng `shouldAutoRunPipeline`; `ai_usage` ghi qua `withJob` (nguyên tắc #7).
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
let staff: string;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 6 });
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
    'Shop job',
    `shop-${ws}`,
  ]);
  // Người bấm "Soạn gợi ý" (đường thủ công) phải là thành viên đang hoạt động.
  staff = (
    await admin.query('INSERT INTO core.users (email, name) VALUES ($1, $2) RETURNING id', [
      `nv-${randomUUID()}@example.test`,
      'nv',
    ])
  ).rows[0].id;
  await admin.query(
    "INSERT INTO core.members (workspace_id, user_id, role, status) VALUES ($1, $2, 'staff', 'active')",
    [ws, staff],
  );
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Trang Shop') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
  // Kiến thức ĐÃ XUẤT BẢN + một đoạn về phí ship.
  const src = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'Ship') RETURNING id",
      [ws],
    )
  ).rows[0].id;
  const ver = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [ws],
    )
  ).rows[0].id;
  await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
     VALUES ($1, $2, $3, 'ship', 'Phí ship nội thành 20.000đ, giao trong 2 ngày', 'vi', 'h-ship', false)`,
    [ws, src, ver],
  );
});

async function addComment(
  source: 'webhook' | 'polling' | 'backfill',
  text = 'ship nội thành bao nhiêu',
): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, status, ingest_source)
       VALUES ($1, $2, $3, $4, 'u1', 'Khách A', $5, 'new', $6) RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`, text, source],
    )
  ).rows[0].id as string;
}

const config = (over: Partial<PipelineJobConfig> = {}): PipelineJobConfig => ({
  db,
  llm: {
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
          sources: [],
          claims: [],
          unanswered_topics: [],
          needs_human: false,
          reason: '',
          variants: [],
        },
      },
    ]),
  },
  pipelineEnabled: async () => true,
  turnLimit: 100,
  ...over,
});

const job = (commentId: string, trigger: 'auto' | 'manual' = 'auto') => ({
  workspaceId: ws,
  commentId,
  trigger,
  ...(trigger === 'manual' ? { requestedBy: staff } : {}),
});
const draftsOf = async (id: string) =>
  (await admin.query('SELECT * FROM cf.drafts WHERE target_id = $1', [id])).rows;
const used = async () =>
  Number(
    (
      await admin.query(
        'SELECT coalesce(sum(used),0) n FROM core.usage_counters WHERE workspace_id = $1',
        [ws],
      )
    ).rows[0].n,
  );

describe('handler pipeline — một bình luận thật', () => {
  it('đường vàng: webhook → bản nháp + nhật ký tìm kiếm từ KB ĐÃ XUẤT BẢN, trừ đúng 1 lượt', async () => {
    const id = await addComment('webhook');
    const out = await runPipelineJob(config(), job(id));
    expect(out.kind).toBe('written');
    expect(await draftsOf(id)).toHaveLength(1);
    const log = (await admin.query('SELECT * FROM cf.retrieval_logs WHERE comment_id = $1', [id]))
      .rows[0];
    expect(log.kb_version).toBe(1);
    expect(log.candidates.length).toBeGreaterThan(0);
    expect(await used()).toBe(1);
  });

  it('đường TỰ ĐỘNG: backfill / cờ tắt / workspace ngoài danh sách → không chạy, không trừ lượt', async () => {
    const backfill = await addComment('backfill');
    expect(await runPipelineJob(config(), job(backfill))).toEqual({
      kind: 'ignored',
      reason: 'not_auto_eligible',
    });
    const normal = await addComment('webhook');
    expect(
      (await runPipelineJob(config({ pipelineEnabled: async () => false }), job(normal))).kind,
    ).toBe('ignored');
    expect(
      (
        await runPipelineJob(
          config({ pipelineEnabled: async (id) => id === 'workspace-khac' }),
          job(normal),
        )
      ).kind,
    ).toBe('ignored');
    expect(await used()).toBe(0);
    expect(await draftsOf(backfill)).toHaveLength(0);
  });

  it('đường THỦ CÔNG (nhân viên bấm) chạy được cả bình luận backfill', async () => {
    const backfill = await addComment('backfill');
    expect((await runPipelineJob(config(), job(backfill, 'manual'))).kind).toBe('written');
    expect(await draftsOf(backfill)).toHaveLength(1);
  });

  it('bình luận không tồn tại / đã gộp → bỏ qua', async () => {
    expect(await runPipelineJob(config(), job(randomUUID()))).toEqual({
      kind: 'ignored',
      reason: 'comment_not_found',
    });
    const a = await addComment('webhook');
    const b = await addComment('webhook');
    await admin.query('UPDATE cf.comments SET merged_into_id = $1 WHERE id = $2', [b, a]);
    expect(await runPipelineJob(config(), job(a))).toEqual({ kind: 'ignored', reason: 'merged' });
  });

  it('PII trong bình luận không lọt vào cột nào đã ghi', async () => {
    const id = await addComment('webhook', 'ship về đâu, gọi 0912345678 hoặc khach@example.com');
    await runPipelineJob(config(), job(id));
    for (const table of ['cf.drafts', 'cf.retrieval_logs', 'cf.kb_gaps']) {
      const dump = (
        await admin.query(`SELECT t::text r FROM ${table} t WHERE workspace_id = $1`, [ws])
      ).rows
        .map((r) => r.r)
        .join('\n');
      expect(dump, table).not.toContain('0912345678');
      expect(dump, table).not.toContain('khach@example.com');
    }
  });
});

describe('gộp bình luận (FR-148) — 1 lượt cho cả nhóm', () => {
  it('3 bình luận cùng khách + bài sát nhau → 1 bản nháp gắn vào bình luận CUỐI, 1 lượt trừ, các bình luận trước merged_into_id', async () => {
    const a = await addComment('webhook', 'áo thun basic');
    const b = await addComment('webhook', 'giá bao nhiêu');
    const c = await addComment('webhook', 'ship nội thành');
    await admin.query(
      "UPDATE cf.comments SET created_time = now() - interval '20 seconds' WHERE id = $1",
      [a],
    );
    await admin.query(
      "UPDATE cf.comments SET created_time = now() - interval '10 seconds' WHERE id = $1",
      [b],
    );
    // Job của bình luận ĐẦU chạy trước: nhóm được gộp và xử lý ở bình luận cuối.
    const out = await runPipelineJob(config(), job(a));
    expect(out.kind).toBe('written');
    expect(await draftsOf(c)).toHaveLength(1);
    expect(await draftsOf(a)).toHaveLength(0);
    const merged = (
      await admin.query('SELECT id, merged_into_id FROM cf.comments WHERE id IN ($1, $2)', [a, b])
    ).rows;
    expect(merged.map((r) => r.merged_into_id)).toEqual([c, c]);
    expect(await used()).toBe(1);
    // Job của các bình luận còn lại (đến muộn) → bỏ qua, không trừ thêm.
    expect((await runPipelineJob(config(), job(b))).kind).toBe('ignored');
    expect((await runPipelineJob(config(), job(c))).kind).not.toBe('written');
    expect(await used()).toBe(1);
  });

  it('khách khác nhau hoặc backfill KHÔNG bị gộp', async () => {
    const a = await addComment('webhook', 'câu một');
    const b = await addComment('webhook', 'câu hai');
    await admin.query("UPDATE cf.comments SET author_external_id = 'u2' WHERE id = $1", [b]);
    const back = await addComment('backfill', 'cũ');
    await runPipelineJob(config(), job(a));
    const rows = (
      await admin.query('SELECT id, merged_into_id FROM cf.comments WHERE id IN ($1, $2, $3)', [
        a,
        b,
        back,
      ])
    ).rows;
    expect(rows.every((r) => r.merged_into_id === null)).toBe(true);
  });
});

describe('ai_usage qua withJob (nguyên tắc #7)', () => {
  it('LLM dựng từ biến môi trường ghi một dòng ai_usage dưới ngữ cảnh job của worker', async () => {
    const reply = JSON.stringify({ ...FIXTURE_EXTRACT_DEFAULT, labels: [{ label: 'advice' }] });
    const deps = createLlmDepsFromEnv({
      env: {
        LITELLM_BASE_URL: 'http://litellm.test',
        LITELLM_API_KEY: 'sk-thu',
        CLASSIFY_LLM_MODEL: 'cf-classify',
      },
      db: { withWorkspace: (id, fn) => db.withJob(id, fn) },
      isStepEnabled: async () => true,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            model: 'mock-llm',
            choices: [{ message: { content: reply } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )) as typeof fetch,
    });
    expect(deps.extractor).toBeDefined();
    await deps.extractor?.extract({
      workspaceId: ws,
      text: 'ship bao nhiêu',
      lang: 'vi',
      productNames: [],
    } as never);
    const rows = (
      await admin.query('SELECT step, workspace_id FROM cf.ai_usage WHERE workspace_id = $1', [ws])
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].workspace_id).toBe(ws);
  });
});
