import { buildKbGapRecord, buildRetrievalLogRecord } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  insertRetrievalLog,
  listKbGaps,
  listRetrievalLogs,
  purgeExpiredRetrievalLogs,
  recordKbGap,
  setKbGapStatus,
} from '../src/retrieval-logs';
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
 * RETRIEVAL-LOG (migration 0040, FR-134, Q-RL1): `cf.retrieval_logs` chỉ INSERT từ hệ thống (withJob), `cf.kb_gaps` ghi đếm
 * chỉ hệ thống + thành viên đổi trạng thái. Mỗi test dùng draft/chủ đề riêng để không đụng dữ liệu của test khác.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let staffA: string;
let ownerB: string;
let outsider: string;
let productA: string;
let sourceA: string;

type Tx = Parameters<Parameters<FlowDb['withJob']>[1]>[0];

const logRecord = (over: Record<string, unknown> = {}) =>
  buildRetrievalLogRecord({
    query: 'size M còn không',
    lang: 'vi',
    route: 'hybrid',
    candidates: [{ chunkId: newId(), vecRank: 1, ftsRank: 2, trgmRank: null, rerankScore: 0.9 }],
    usedChunkIds: [],
    resolvedProductIds: [],
    latencyMs: 80,
    ...over,
  });
const writeLog = (ws: string, over: Record<string, unknown> = {}) =>
  worker.withJob(ws, (tx) => insertRetrievalLog(tx, ws, logRecord(over)));
const gap = (over: Record<string, unknown> = {}) =>
  buildKbGapRecord({ topic: 'shipping', sampleQuestion: 'ship Cà Mau bao nhiêu', ...over });
const writeGap = (ws: string, over: Record<string, unknown> = {}) =>
  worker.withJob(ws, (tx) => recordKbGap(tx, ws, gap(over)));
const gapRow = async (id: string) =>
  (
    await admin.query(
      `SELECT count, status, resolved_by_source_id, first_seen_at, last_seen_at FROM cf.kb_gaps WHERE id = $1`,
      [id],
    )
  ).rows[0] as
    | {
        count: number;
        status: string;
        resolved_by_source_id: string | null;
        first_seen_at: Date;
        last_seen_at: Date;
      }
    | undefined;

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  staffA = await seedUser(admin);
  ownerB = await seedUser(admin);
  outsider = await seedUser(admin);
  await seedMember(admin, wsA, staffA, 'staff');
  await seedMember(admin, wsB, ownerB, 'owner');
  productA = (
    await admin.query(
      `INSERT INTO cf.products (workspace_id, name, search_text, status) VALUES ($1, 'Áo thử', 'ao thu', 'active') RETURNING id`,
      [wsA],
    )
  ).rows[0].id;
  sourceA = (
    await admin.query(
      `INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'manual', 'Nguồn thử') RETURNING id`,
      [wsA],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close(), admin.end()]);
});

describe('FR-134 retrieval_logs — ghi chỉ từ hệ thống', () => {
  it('FR-134 job hệ thống ghi được; đọc lại đủ ứng viên, route, sản phẩm đã nhận', async () => {
    const draftId = newId();
    const used = newId();
    const id = await writeLog(wsA, {
      draftId,
      usedChunkIds: [used],
      resolvedProductIds: [productA],
      route: 'both',
      searchQuery: 'ghép bình luận cha',
      kbVersion: 3,
    });
    const rows = await web.withActor(wsA, staffA, (tx) => listRetrievalLogs(tx, { draftId }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      route: 'both',
      kbVersion: 3,
      usedChunkIds: [used],
      resolvedProductIds: [productA],
      searchQueryMasked: 'ghép bình luận cha',
    });
    expect(rows[0]?.candidates).toHaveLength(1);
  });

  it('FR-134 nguyên tắc #6: SĐT trong câu hỏi đã được che trước khi vào DB', async () => {
    const draftId = newId();
    await writeLog(wsA, { draftId, query: 'gọi 0912345678 giúp' });
    const raw = await admin.query(
      `SELECT query_masked FROM cf.retrieval_logs WHERE draft_id = $1`,
      [draftId],
    );
    expect(raw.rows[0].query_masked).toBe('gọi [sđt] giúp');
  });

  it('FR-134 web (withActor/withWorkspace/withJob trên cf_app) không INSERT được', async () => {
    const rec = logRecord();
    for (const run of [
      () => web.withActor(wsA, staffA, (tx) => insertRetrievalLog(tx, wsA, rec)),
      () => web.withWorkspace(wsA, (tx) => insertRetrievalLog(tx, wsA, rec)),
      () => web.withJob(wsA, (tx) => insertRetrievalLog(tx, wsA, rec)),
    ]) {
      expect(await expectRejectCode(run())).toBe('42501');
    }
  });

  it('FR-134 job của workspace B không ghi hộ workspace A', async () => {
    expect(
      await expectRejectCode(worker.withJob(wsB, (tx) => insertRetrievalLog(tx, wsA, logRecord()))),
    ).toBe('42501');
  });

  it('FR-134 không ai UPDATE/DELETE được (kể cả hệ thống qua cf_app)', async () => {
    const draftId = newId();
    await writeLog(wsA, { draftId });
    const attempts: Array<(tx: Tx) => Promise<unknown>> = [
      (tx) =>
        tx.execute(sql`UPDATE cf.retrieval_logs SET latency_ms = 0 WHERE workspace_id = ${wsA}`),
      (tx) => tx.execute(sql`DELETE FROM cf.retrieval_logs WHERE workspace_id = ${wsA}`),
    ];
    for (const attempt of attempts) {
      expect(await expectRejectCode(worker.withJob(wsA, attempt))).toBe('42501');
    }
    const left = await admin.query(`SELECT 1 FROM cf.retrieval_logs WHERE draft_id = $1`, [
      draftId,
    ]);
    expect(left.rowCount).toBe(1);
  });

  it('FR-134 ràng buộc DB: route lạ, độ trễ âm, quá 50 ứng viên bị từ chối (23514)', async () => {
    for (const bad of [
      { route: 'vector' },
      { latencyMs: -1 },
      { candidates: Array.from({ length: 51 }, () => ({ chunk_id: newId() })) },
    ]) {
      const record = { ...logRecord(), ...bad };
      expect(
        await expectRejectCode(
          worker.withJob(wsA, (tx) => insertRetrievalLog(tx, wsA, record as never)),
        ),
      ).toBe('23514');
    }
  });
});

describe('FR-134 cách ly workspace', () => {
  it('FR-134 B không thấy nhật ký và kb_gaps của A; thành viên A thấy; người ngoài không thấy', async () => {
    const draftId = newId();
    await writeLog(wsA, { draftId });
    const gapId = (await writeGap(wsA, { topic: 'policy' })).id;
    expect(
      await web.withActor(wsB, ownerB, (tx) => listRetrievalLogs(tx, { draftId })),
    ).toHaveLength(0);
    expect(
      (await web.withActor(wsB, ownerB, (tx) => listKbGaps(tx, {}))).map((g) => g.id),
    ).not.toContain(gapId);
    expect(
      await web.withActor(wsA, staffA, (tx) => listRetrievalLogs(tx, { draftId })),
    ).toHaveLength(1);
    expect(
      (await web.withActor(wsA, staffA, (tx) => listKbGaps(tx, {}))).map((g) => g.id),
    ).toContain(gapId);
    expect(
      await web.withActor(wsA, outsider, (tx) => listRetrievalLogs(tx, { draftId })),
    ).toHaveLength(0);
    expect(await web.withActor(wsA, outsider, (tx) => listKbGaps(tx, {}))).toHaveLength(0);
  });
});

describe('FR-134 FR-141 kb_gaps — gộp theo (workspace, chủ đề, sản phẩm)', () => {
  it('FR-134 lần đầu count=1; lần sau count+1, last_seen mới, first_seen giữ', async () => {
    const first = await writeGap(wsA, { topic: 'size', productId: productA });
    expect(first).toMatchObject({ count: 1, status: 'open' });
    const before = await gapRow(first.id);
    const second = await writeGap(wsA, { topic: 'size', productId: productA });
    expect(second).toMatchObject({ id: first.id, count: 2 });
    const after = await gapRow(first.id);
    expect(after?.first_seen_at.getTime()).toBe(before?.first_seen_at.getTime());
    expect(after?.last_seen_at.getTime()).toBeGreaterThanOrEqual(
      before?.last_seen_at.getTime() ?? 0,
    );
  });

  it('M3-1 fact_topic: cùng chủ đề mịn giữ nguyên, khác chủ đề (hoặc thiếu) → NULL, không bao giờ quay lại', async () => {
    const factTopicOf = async (id: string) =>
      (await admin.query('SELECT fact_topic FROM cf.kb_gaps WHERE id = $1', [id])).rows[0]
        .fact_topic as string | null;
    const fresh = await seedWorkspace(admin);
    const first = await writeGap(fresh, { topic: 'policy', factTopic: 'warranty' });
    expect(await factTopicOf(first.id)).toBe('warranty');
    await writeGap(fresh, { topic: 'policy', factTopic: 'warranty' });
    expect(await factTopicOf(first.id)).toBe('warranty');
    await writeGap(fresh, { topic: 'policy', factTopic: 'payment' });
    expect(await factTopicOf(first.id)).toBeNull();
    await writeGap(fresh, { topic: 'policy', factTopic: 'payment' });
    expect(await factTopicOf(first.id)).toBeNull();
  });

  it('FR-134 sản phẩm khác = dòng khác; sản phẩm null gộp chung một dòng', async () => {
    const a = await writeGap(wsA, { topic: 'discount', productId: productA });
    const none1 = await writeGap(wsA, { topic: 'discount' });
    const none2 = await writeGap(wsA, { topic: 'discount' });
    expect(none1.id).not.toBe(a.id);
    expect(none2).toMatchObject({ id: none1.id, count: none1.count + 1 });
  });

  it('FR-134 đua: 20 lệnh song song → đúng một dòng, count = 20', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => writeGap(wsA, { topic: 'order_status' })),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(Math.max(...results.map((r) => r.count))).toBe(20);
  });

  it('FR-134 gặp lại gap đã resolved → mở lại; ignored giữ nguyên nhưng vẫn đếm', async () => {
    const g = await writeGap(wsA, { topic: 'other' });
    await web.withActor(wsA, staffA, (tx) => setKbGapStatus(tx, g.id, 'resolved', sourceA));
    expect(await gapRow(g.id)).toMatchObject({
      status: 'resolved',
      resolved_by_source_id: sourceA,
    });
    expect(await writeGap(wsA, { topic: 'other' })).toMatchObject({
      id: g.id,
      status: 'open',
      count: 2,
    });
    expect(await gapRow(g.id)).toMatchObject({ resolved_by_source_id: null });
    await web.withActor(wsA, staffA, (tx) => setKbGapStatus(tx, g.id, 'ignored'));
    expect(await writeGap(wsA, { topic: 'other' })).toMatchObject({ status: 'ignored', count: 3 });
  });

  it('FR-134 lọc theo chủ đề/sản phẩm/trạng thái', async () => {
    const g = await writeGap(wsA, { topic: 'product_info', productId: productA });
    const rows = await web.withActor(wsA, staffA, (tx) =>
      listKbGaps(tx, { topic: 'product_info', productId: productA, status: 'open' }),
    );
    expect(rows.map((r) => r.id)).toContain(g.id);
    expect(
      await web.withActor(wsA, staffA, (tx) =>
        listKbGaps(tx, { topic: 'product_info', status: 'ignored' }),
      ),
    ).toHaveLength(0);
  });
});

describe('FR-141 kb_gaps — quyền của thành viên', () => {
  it('FR-141 thành viên (Staff) resolve/ignore được nhưng KHÔNG sửa count/last_seen/mẫu câu hỏi', async () => {
    const g = await writeGap(wsA, { topic: 'shipping', productId: productA });
    const tamper: Array<(tx: Tx) => Promise<unknown>> = [
      (tx) => tx.execute(sql`UPDATE cf.kb_gaps SET count = 0 WHERE id = ${g.id}`),
      (tx) => tx.execute(sql`UPDATE cf.kb_gaps SET last_seen_at = now() WHERE id = ${g.id}`),
      (tx) =>
        tx.execute(sql`UPDATE cf.kb_gaps SET sample_question_masked = 'x' WHERE id = ${g.id}`),
    ];
    for (const attempt of tamper) {
      expect(await expectRejectCode(web.withActor(wsA, staffA, attempt))).toBe('42501');
    }
    await web.withActor(wsA, staffA, (tx) => setKbGapStatus(tx, g.id, 'ignored'));
    expect(await gapRow(g.id)).toMatchObject({ status: 'ignored', count: 1 });
  });

  it('FR-141 không đổi được workspace_id/chủ đề/sản phẩm; không INSERT/DELETE từ web', async () => {
    const g = await writeGap(wsA, { topic: 'policy', productId: productA });
    const forbidden: Array<(tx: Tx) => Promise<unknown>> = [
      (tx) => tx.execute(sql`UPDATE cf.kb_gaps SET topic = 'other' WHERE id = ${g.id}`),
      (tx) => tx.execute(sql`UPDATE cf.kb_gaps SET workspace_id = ${wsB} WHERE id = ${g.id}`),
      (tx) => tx.execute(sql`UPDATE cf.kb_gaps SET product_id = NULL WHERE id = ${g.id}`),
      (tx) =>
        tx.execute(sql`INSERT INTO cf.kb_gaps (workspace_id, topic, sample_question_masked)
          VALUES (${wsA}, 'other', 'x')`),
      (tx) => tx.execute(sql`DELETE FROM cf.kb_gaps WHERE id = ${g.id}`),
    ];
    for (const attempt of forbidden) {
      expect(await expectRejectCode(web.withActor(wsA, staffA, attempt))).toBe('42501');
    }
  });

  it('FR-141 người ngoài và workspace khác không đổi được trạng thái (0 dòng bị đổi)', async () => {
    const g = await writeGap(wsA, { topic: 'discount', productId: productA });
    await web.withActor(wsA, outsider, (tx) => setKbGapStatus(tx, g.id, 'ignored'));
    await web.withActor(wsB, ownerB, (tx) => setKbGapStatus(tx, g.id, 'ignored'));
    expect((await gapRow(g.id))?.status).toBe('open');
  });

  it('FR-141 resolved_by_source_id chỉ hợp lệ khi resolved và nguồn thuộc cùng workspace', async () => {
    const g = await writeGap(wsA, { topic: 'size' });
    const otherWsSource = (
      await admin.query(
        `INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'manual', 'Nguồn B') RETURNING id`,
        [wsB],
      )
    ).rows[0].id;
    expect(
      await expectRejectCode(
        web.withActor(wsA, staffA, (tx) => setKbGapStatus(tx, g.id, 'resolved', otherWsSource)),
      ),
    ).toBe('23503');
    expect(
      await expectRejectCode(
        web.withActor(wsA, staffA, (tx) =>
          tx.execute(
            sql`UPDATE cf.kb_gaps SET resolved_by_source_id = ${sourceA} WHERE id = ${g.id}`,
          ),
        ),
      ),
    ).toBe('23514');
  });
});

describe('FR-134 dọn nhật ký quá 90 ngày', () => {
  it('FR-134 xóa nhật ký cũ hơn 90 ngày, giữ nhật ký mới', async () => {
    const oldDraft = newId();
    const freshDraft = newId();
    await writeLog(wsA, { draftId: oldDraft });
    await writeLog(wsA, { draftId: freshDraft });
    await admin.query(
      `UPDATE cf.retrieval_logs SET created_at = now() - interval '91 days' WHERE draft_id = $1`,
      [oldDraft],
    );
    const removed = await worker.withSystem((tx) => purgeExpiredRetrievalLogs(tx, 90));
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await admin.query(
      `SELECT draft_id FROM cf.retrieval_logs WHERE draft_id = ANY($1::uuid[])`,
      [[oldDraft, freshDraft]],
    );
    expect(left.rows.map((r) => r.draft_id)).toEqual([freshDraft]);
  });

  it('FR-134 đúng ngưỡng: 89 ngày còn, số ngày < 1 bị từ chối, ngữ cảnh khác bị từ chối', async () => {
    const draft = newId();
    await writeLog(wsA, { draftId: draft });
    await admin.query(
      `UPDATE cf.retrieval_logs SET created_at = now() - interval '89 days' WHERE draft_id = $1`,
      [draft],
    );
    await worker.withSystem((tx) => purgeExpiredRetrievalLogs(tx, 90));
    expect(
      (await admin.query(`SELECT 1 FROM cf.retrieval_logs WHERE draft_id = $1`, [draft])).rowCount,
    ).toBe(1);
    for (const tooSmall of [0, 29]) {
      expect(
        await expectRejectCode(worker.withSystem((tx) => purgeExpiredRetrievalLogs(tx, tooSmall))),
      ).toBe('CF422');
    }
    await worker.withSystem((tx) => purgeExpiredRetrievalLogs(tx, 30));
    expect(await expectRejectCode(web.withSystem((tx) => purgeExpiredRetrievalLogs(tx, 90)))).toBe(
      '42501',
    );
    expect(
      await expectRejectCode(worker.withJob(wsA, (tx) => purgeExpiredRetrievalLogs(tx, 90))),
    ).toBe('42501');
    expect(
      await expectRejectCode(web.withActor(wsA, staffA, (tx) => purgeExpiredRetrievalLogs(tx, 90))),
    ).toBe('42501');
  });
});
