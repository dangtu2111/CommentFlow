import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { compactAiUsage, purgeExpiredWorkspaceData } from '../src/retention';
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
 * RETENTION-JOB (migration 0053, FR-126, Q-RET1): xóa dữ liệu quá 12 tháng + gộp ai_usage 90 ngày theo ngày.
 * Hàm DEFINER chỉ chạy ở ngữ cảnh trần của kết nối cf_worker; web/actor/job đều bị từ chối.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let ownerA: string;
let channelA: string;
let postA: string;

async function comment(ws: string, ageDays: number): Promise<string> {
  const ch = ws === wsA ? channelA : null;
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, created_at)
     VALUES ($1, $2, $3, $4, 'u1', 'nội dung', now() - make_interval(days => $5)) RETURNING id`,
    [ws, ch, postA, `cm-${newId()}`, ageDays],
  );
  return r.rows[0].id as string;
}

const exists = async (table: string, id: string): Promise<boolean> =>
  (await admin.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount === 1;

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  ownerA = await seedUser(admin);
  await seedMember(admin, wsA, ownerA, 'owner');
  channelA = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page A') RETURNING id",
      [wsA, `pg-${newId()}`],
    )
  ).rows[0].id;
  postA = (
    await admin.query(
      "INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ($1, $2, $3, 'bài 1') RETURNING id",
      [wsA, channelA, `po-${newId()}`],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await web.close();
  await worker.close();
  await admin.end();
});

describe('FR-126 xóa dữ liệu quá thời hạn lưu (cf.purge_expired_workspace_data)', () => {
  it('xóa bình luận > 365 ngày (kéo theo trả lời), giữ bình luận mới và nhật ký kiểm toán', async () => {
    const oldC = await comment(wsA, 400);
    const freshC = await comment(wsA, 364);
    await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, action, target_type, target_id)
       VALUES ($1, 'system', 'test.retention', 'comment', $2)`,
      [wsA, oldC],
    );
    const result = await worker.withSystem((tx) => purgeExpiredWorkspaceData(tx, 365));
    expect(result.comments).toBeGreaterThanOrEqual(1);
    expect(await exists('cf.comments', oldC)).toBe(false);
    expect(await exists('cf.comments', freshC)).toBe(true);
    const logs = await admin.query(
      `SELECT 1 FROM core.action_logs WHERE target_id = $1 AND action = 'test.retention'`,
      [oldC],
    );
    expect(logs.rowCount).toBe(1);
  });

  it('xóa nháp AI và khách tiềm năng quá hạn, giữ bản mới', async () => {
    const oldDraft = newId();
    const freshDraft = newId();
    for (const [id, age] of [
      [oldDraft, 400],
      [freshDraft, 10],
    ] as const) {
      await admin.query(
        `INSERT INTO cf.drafts (id, workspace_id, target_type, target_id, text, lang, created_at)
         VALUES ($1, $2, 'comment', $3, 'nháp', 'vi', now() - make_interval(days => $4))`,
        [id, wsA, newId(), age],
      );
    }
    const mkLead = async (age: number): Promise<string> => {
      const r = await admin.query(
        `INSERT INTO cf.leads (workspace_id, channel_id, source_type, phone_enc, phone_hash, phone_last4, key_version, updated_at)
         VALUES ($1, $2, 'comment', '\\x01', $3, '1234', 1, now() - make_interval(days => $4)) RETURNING id`,
        [wsA, channelA, randomBytes(32), age],
      );
      return r.rows[0].id as string;
    };
    const oldLead = await mkLead(400);
    const freshLead = await mkLead(5);
    await worker.withSystem((tx) => purgeExpiredWorkspaceData(tx, 365));
    expect(await exists('cf.drafts', oldDraft)).toBe(false);
    expect(await exists('cf.drafts', freshDraft)).toBe(true);
    expect(await exists('cf.leads', oldLead)).toBe(false);
    expect(await exists('cf.leads', freshLead)).toBe(true);
  });

  it('cận dưới 180 ngày (CF422) và chỉ ngữ cảnh trần của cf_worker (42501)', async () => {
    const call = (tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, d: number) =>
      tx.execute(sql`SELECT * FROM cf.purge_expired_workspace_data(${d}::integer)`);
    expect(await expectRejectCode(worker.withSystem((tx) => call(tx, 179)))).toBe('CF422');
    expect(await expectRejectCode(worker.withSystem((tx) => call(tx, 0)))).toBe('CF422');
    expect(await expectRejectCode(web.withSystem((tx) => call(tx, 365)))).toBe('42501');
    expect(await expectRejectCode(worker.withJob(wsA, (tx) => call(tx, 365)))).toBe('42501');
    expect(await expectRejectCode(web.withActor(wsA, ownerA, (tx) => call(tx, 365)))).toBe('42501');
  });
});

describe('FR-126 gộp ai_usage theo ngày (cf.compact_ai_usage)', () => {
  const seed = async (ws: string, ageDays: number, tokens: number, cost: string) => {
    await admin.query(
      `INSERT INTO cf.ai_usage (workspace_id, step, model, prompt_version, input_tokens, output_tokens, cached_tokens, cost_usd, created_at)
       VALUES ($1, 'ret-step', 'ret-model', NULL, $2, $2, $2, $3, now() - make_interval(days => $4))`,
      [ws, tokens, cost, ageDays],
    );
  };
  const totals = async (ws: string) =>
    (
      await admin.query(
        `SELECT (SELECT coalesce(sum(input_tokens), 0) FROM cf.ai_usage WHERE workspace_id = $1 AND step = 'ret-step')
              + (SELECT coalesce(sum(input_tokens), 0) FROM cf.ai_usage_daily WHERE workspace_id = $1 AND step = 'ret-step') AS tokens,
                (SELECT coalesce(sum(cost_usd), 0) FROM cf.ai_usage WHERE workspace_id = $1 AND step = 'ret-step')
              + (SELECT coalesce(sum(cost_usd), 0) FROM cf.ai_usage_daily WHERE workspace_id = $1 AND step = 'ret-step') AS cost`,
        [ws],
      )
    ).rows[0] as { tokens: string; cost: string };

  it('gộp dòng > 90 ngày vào bản theo ngày, bảo toàn tổng, giữ dòng mới, chạy lại cộng dồn đúng', async () => {
    await seed(wsB, 100, 10, '0.5');
    await seed(wsB, 100, 5, '0.25');
    await seed(wsB, 10, 7, '0.1');
    const before = await totals(wsB);
    const n = await worker.withSystem((tx) => compactAiUsage(tx, 90));
    expect(n).toBeGreaterThanOrEqual(2);
    const daily = await admin.query(
      `SELECT calls, input_tokens, prompt_version FROM cf.ai_usage_daily WHERE workspace_id = $1 AND step = 'ret-step'`,
      [wsB],
    );
    expect(daily.rows).toHaveLength(1);
    expect(daily.rows[0]).toMatchObject({ calls: 2, input_tokens: '15', prompt_version: '' });
    const raw = await admin.query(
      `SELECT count(*)::int AS n FROM cf.ai_usage WHERE workspace_id = $1 AND step = 'ret-step'`,
      [wsB],
    );
    expect(raw.rows[0].n).toBe(1);
    expect(await totals(wsB)).toEqual(before);

    // dòng cũ mới xuất hiện cùng ngày → cộng dồn vào bản đã có (ON CONFLICT)
    await seed(wsB, 100, 3, '0.05');
    await worker.withSystem((tx) => compactAiUsage(tx, 90));
    const again = await admin.query(
      `SELECT calls, input_tokens FROM cf.ai_usage_daily WHERE workspace_id = $1 AND step = 'ret-step' ORDER BY day`,
      [wsB],
    );
    const sumCalls = again.rows.reduce((a, r) => a + r.calls, 0);
    expect(sumCalls).toBe(3);
  });

  it('thành viên chỉ đọc bản gộp của workspace mình; web không ghi được; cận dưới 30 ngày; chỉ cf_worker', async () => {
    const own = await web.withActor(wsA, ownerA, (tx) =>
      tx.execute(sql`SELECT count(*)::int AS n FROM cf.ai_usage_daily`),
    );
    expect(own.rows[0]).toMatchObject({ n: 0 });
    expect(
      await expectRejectCode(
        web.withActor(wsA, ownerA, (tx) =>
          tx.execute(
            sql`INSERT INTO cf.ai_usage_daily (workspace_id, day, step, model, cache_hit, calls, input_tokens, output_tokens, cached_tokens, cost_usd)
                VALUES (${wsA}, current_date, 's', 'm', false, 1, 1, 1, 1, 1)`,
          ),
        ),
      ),
    ).toBe('42501');
    const call = (tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, d: number) =>
      tx.execute(sql`SELECT cf.compact_ai_usage(${d}::integer)`);
    expect(await expectRejectCode(worker.withSystem((tx) => call(tx, 29)))).toBe('CF422');
    expect(await expectRejectCode(web.withSystem((tx) => call(tx, 90)))).toBe('42501');
    expect(await expectRejectCode(worker.withJob(wsA, (tx) => call(tx, 90)))).toBe('42501');
  });
});
