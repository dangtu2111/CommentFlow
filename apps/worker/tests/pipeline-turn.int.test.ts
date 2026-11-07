import { randomUUID } from 'node:crypto';
import {
  createDemoKnowledge,
  createFixtureDrafter,
  createFixtureExtractor,
  createTurnGate,
  FIXTURE_EXTRACT_DEFAULT,
  runPipeline,
} from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import { usagePeriodStart } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDbTurnPorts } from '../src/jobs/pipeline-turn';

/**
 * PIPE-ORCHESTRATOR lát C (Q-POR3, FR-090): cổng lượt trên DB THẬT — giành quyền + khóa duy nhất theo comment_id + trừ lượt trong MỘT giao
 * dịch; trừ đúng MỘT lần dù thử lại/đồng thời/crash giữa chừng; hết lượt/dừng khẩn cấp thì không trừ và chuyển "Cần nhân viên".
 * (LLM chưa được gọi ở lát này: các test chỉ kiểm cổng.)
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
const TZ = 'Asia/Ho_Chi_Minh';

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
  // Mỗi test một workspace riêng: bộ đếm lượt không lẫn nhau.
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop lượt',
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

async function addComment(status = 'new'): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source)
       VALUES ($1, $2, $3, $4, 'u1', 'Giá bao nhiêu?', $5, 'webhook') RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`, status],
    )
  ).rows[0].id as string;
}

const used = async (): Promise<number> => {
  const r = await admin.query(
    "SELECT used FROM core.usage_counters WHERE workspace_id = $1 AND product = 'commentflow' AND meter = 'ai_turns'",
    [ws],
  );
  return r.rows[0] ? Number(r.rows[0].used) : 0;
};
const turn = async (id: string) =>
  (await admin.query('SELECT * FROM cf.pipeline_turns WHERE comment_id = $1', [id])).rows;
const statusOf = async (id: string) =>
  (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0]
    .status as string;

const ports = (
  commentId: string,
  over: { limit?: number; maxAttempts?: number; failConsume?: boolean; leaseSeconds?: number } = {},
) =>
  createDbTurnPorts({
    db,
    workspaceId: ws,
    commentId,
    limit: over.limit ?? 100,
    timeZone: TZ,
    maxAttempts: over.maxAttempts ?? 3,
    // Mặc định không giữ thuê: mô phỏng lần thử lại sau khi lần trước đã kết thúc/crash; test thuê đặt giá trị thật.
    leaseSeconds: over.leaseSeconds ?? 0,
    ...(over.failConsume
      ? {
          consume: async () => {
            throw new Error('consume lỗi giữa chừng');
          },
        }
      : {}),
  });
const ctx = { maskedText: 'giá bao nhiêu', lang: 'vi' as const };

describe('cổng lượt trên DB thật — trừ lượt idempotent theo bình luận', () => {
  it('lần đầu: trừ ĐÚNG 1 lượt, ghi khóa + charged_at, bình luận processing', async () => {
    const id = await addComment();
    expect(await ports(id).begin()).toEqual({ outcome: 'proceed', charged: true });
    expect(await used()).toBe(1);
    expect(await statusOf(id)).toBe('processing');
    const rows = await turn(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].charged_at).not.toBeNull();
  });

  it('CRASH sau khi đã trừ lượt (trước persist) rồi chạy lại: xử lý tiếp, KHÔNG trừ thêm', async () => {
    const id = await addComment();
    await ports(id).begin(); // lần 1: trừ lượt, rồi "crash" (không làm gì thêm)
    expect(await used()).toBe(1);
    // job được pg-boss thử lại
    expect(await ports(id).begin()).toEqual({ outcome: 'proceed', charged: false });
    expect(await ports(id).begin()).toEqual({ outcome: 'proceed', charged: false });
    expect(await used()).toBe(1);
    expect((await turn(id))[0].attempts).toBe(3);
  });

  it('5 job đồng thời cùng một bình luận (có thuê) → trừ đúng 1 lượt, đúng 1 dòng khóa, chỉ một job được chạy tiếp, các job còn lại busy (không tăng lần thử, không gọi LLM trùng)', async () => {
    const id = await addComment();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => ports(id, { leaseSeconds: 120 }).begin()),
    );
    expect(results.filter((r) => r.outcome === 'proceed' && r.charged)).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'busy')).toHaveLength(4);
    expect(await used()).toBe(1);
    const rows = await turn(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(1);
  });

  it('cổng: job trùng khi đang có job khác xử lý → chặn busy (không phải lỗi, không trừ thêm)', async () => {
    const id = await addComment();
    expect(await createTurnGate(ports(id, { leaseSeconds: 120 }))(ctx)).toEqual({ allow: true });
    expect(await createTurnGate(ports(id, { leaseSeconds: 120 }))(ctx)).toEqual({
      allow: false,
      reason: 'busy',
    });
    expect(await used()).toBe(1);
  });

  it('lỗi giữa chừng khi trừ lượt → HOÀN TÁC cả khóa và trạng thái (không có khóa mồ côi), lần sau trừ đúng 1 lần', async () => {
    const id = await addComment();
    await expect(ports(id, { failConsume: true }).begin()).rejects.toThrow(
      'consume lỗi giữa chừng',
    );
    expect(await turn(id)).toHaveLength(0);
    expect(await statusOf(id)).toBe('new');
    expect(await used()).toBe(0);
    expect(await ports(id).begin()).toEqual({ outcome: 'proceed', charged: true });
    expect(await used()).toBe(1);
  });

  it('mỗi bình luận khác nhau trừ một lượt riêng', async () => {
    const [a, b, c] = [await addComment(), await addComment(), await addComment()];
    for (const id of [a, b, c]) await ports(id).begin();
    expect(await used()).toBe(3);
  });
});

describe('hết lượt, dừng khẩn cấp, hết lần thử', () => {
  it('hết hạn mức → quota_exhausted: KHÔNG trừ, khóa blocked, bình luận needs_human; thử lại vẫn không trừ', async () => {
    const first = await addComment();
    await ports(first, { limit: 1 }).begin(); // dùng hết 1/1
    expect(await used()).toBe(1);
    const second = await addComment();
    expect(await ports(second, { limit: 1 }).begin()).toEqual({ outcome: 'quota_exhausted' });
    expect(await used()).toBe(1);
    expect((await turn(second))[0]).toMatchObject({
      state: 'blocked',
      last_error: 'quota_exhausted',
      charged_at: null,
    });
    expect(await statusOf(second)).toBe('needs_human');
    // Bình luận đã sang needs_human nên không giành lại được → vẫn không trừ.
    expect(await ports(second, { limit: 1 }).begin()).toEqual({ outcome: 'not_claimable' });
    expect(await used()).toBe(1);
  });

  it('hạn mức 0 → chặn ngay, không trừ', async () => {
    const id = await addComment();
    expect(await ports(id, { limit: 0 }).begin()).toEqual({ outcome: 'quota_exhausted' });
    expect(await used()).toBe(0);
  });

  it('quá số lần thử → attempts_exhausted, needs_human (không kẹt processing)', async () => {
    const id = await addComment();
    await ports(id, { maxAttempts: 2 }).begin();
    await ports(id, { maxAttempts: 2 }).begin();
    expect(await ports(id, { maxAttempts: 2 }).begin()).toEqual({ outcome: 'attempts_exhausted' });
    expect(await statusOf(id)).toBe('needs_human');
    expect(await used()).toBe(1);
  });

  it('bình luận đã xử lý xong / của Page → not_claimable, không trừ', async () => {
    const done = await addComment('pending_review');
    expect(await ports(done).begin()).toEqual({ outcome: 'not_claimable' });
    expect(await used()).toBe(0);
  });

  it('dừng khẩn cấp đọc từ DB; cổng chặn emergency_stop và KHÔNG giành quyền/trừ lượt', async () => {
    const id = await addComment();
    const gate = createTurnGate(ports(id));
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    expect(await gate(ctx)).toEqual({ allow: false, reason: 'emergency_stop' });
    expect(await used()).toBe(0);
    expect(await turn(id)).toHaveLength(0);
    expect(await statusOf(id)).toBe('new');
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = NULL WHERE id = $1', [ws]);
    expect(await gate(ctx)).toEqual({ allow: true });
    expect(await used()).toBe(1);
  });

  it('cổng đầy đủ: hết lượt → chặn quota_exhausted; lỗi hạ tầng → chặn gate_error (đóng khi lỗi)', async () => {
    const id = await addComment();
    expect(await createTurnGate(ports(id, { limit: 0 }))(ctx)).toEqual({
      allow: false,
      reason: 'quota_exhausted',
    });
    const id2 = await addComment();
    expect(await createTurnGate(ports(id2, { failConsume: true }))(ctx)).toEqual({
      allow: false,
      reason: 'gate_error',
    });
  });

  it('chạm 80% báo một lần trong kỳ (cờ warned_80_at do bộ đếm đặt, không do cổng)', async () => {
    const limit = 5;
    const ids = [await addComment(), await addComment(), await addComment(), await addComment()];
    for (const id of ids) await ports(id, { limit }).begin();
    const period = usagePeriodStart(new Date(), TZ);
    const row = (
      await admin.query(
        'SELECT used, warned_80_at FROM core.usage_counters WHERE workspace_id = $1 AND period_start = $2',
        [ws, period],
      )
    ).rows[0];
    expect(Number(row.used)).toBe(4);
    expect(row.warned_80_at).not.toBeNull();
  });
});

describe('runPipeline + cổng DB thật: bị chặn thì KHÔNG gọi extract/draft (không tốn token)', () => {
  const run = async (commentId: string, over: { limit?: number } = {}) => {
    let extractCalls = 0;
    let draftCalls = 0;
    const base = createFixtureExtractor([
      {
        match: /./,
        result: { ...FIXTURE_EXTRACT_DEFAULT, labels: [{ label: 'advice' }], asks: ['phí ship'] },
      },
    ]);
    const baseDrafter = createFixtureDrafter([
      {
        match: /./,
        result: {
          reply: 'Phí ship nội thành 20.000đ ạ',
          lang: 'vi',
          sources: ['demo-kb-ship'],
          claims: [{ text: 'Phí ship 20.000đ', source_ids: ['demo-kb-ship'], kind: 'fact' }],
          unanswered_topics: [],
          needs_human: false,
          reason: '',
          variants: [],
        },
      },
    ]);
    const result = await runPipeline(
      {
        workspaceId: ws,
        text: 'ship về Hà Nội bao nhiêu',
        kbVersion: 'v1',
        voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
        autoSendEnabled: false,
      },
      {
        extractor: {
          extract: async (input) => {
            extractCalls += 1;
            return base.extract(input);
          },
        },
        drafter: {
          draft: async (input) => {
            draftCalls += 1;
            return baseDrafter.draft(input);
          },
        },
        knowledge: createDemoKnowledge(),
        gate: createTurnGate(ports(commentId, over)),
      },
    );
    return { result, extractCalls, draftCalls };
  };

  it('bình thường: chạy đủ chuỗi và trừ đúng 1 lượt', async () => {
    const id = await addComment();
    const { result, extractCalls } = await run(id);
    expect(result.status).toBe('done');
    expect(extractCalls).toBe(1);
    expect(await used()).toBe(1);
  });

  it('hết hạn mức → blocked quota_exhausted, extract/draft KHÔNG được gọi, không trừ', async () => {
    const id = await addComment();
    const { result, extractCalls, draftCalls } = await run(id, { limit: 0 });
    expect(result).toMatchObject({ status: 'blocked', reason: 'quota_exhausted' });
    expect(extractCalls).toBe(0);
    expect(draftCalls).toBe(0);
    expect(await used()).toBe(0);
  });

  it('dừng khẩn cấp → blocked emergency_stop, extract/draft KHÔNG được gọi, không giành quyền, không trừ', async () => {
    const id = await addComment();
    await admin.query('UPDATE core.workspaces SET emergency_stopped_at = now() WHERE id = $1', [
      ws,
    ]);
    const { result, extractCalls, draftCalls } = await run(id);
    expect(result).toMatchObject({ status: 'blocked', reason: 'emergency_stop' });
    expect(extractCalls + draftCalls).toBe(0);
    expect(await used()).toBe(0);
    expect(await turn(id)).toHaveLength(0);
  });

  it('bình luận chỉ emoji bị ruleFilter bỏ TRƯỚC cổng → không giành quyền, không trừ lượt (FR-024)', async () => {
    const id = await addComment();
    let gateCalls = 0;
    const result = await runPipeline(
      {
        workspaceId: ws,
        text: '👍👍',
        kbVersion: 'v1',
        voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
        autoSendEnabled: false,
      },
      {
        extractor: createFixtureExtractor([]),
        drafter: createFixtureDrafter([]),
        knowledge: createDemoKnowledge(),
        gate: async () => {
          gateCalls += 1;
          return { allow: true };
        },
      },
    );
    expect(result.status).toBe('skipped');
    expect(gateCalls).toBe(0);
    expect(await used()).toBe(0);
    expect(await turn(id)).toHaveLength(0);
  });
});
