import { randomUUID } from 'node:crypto';
import { loadWorkspaceKnowledge, type TryKnowledge } from '@flow/ai';
import { createDb, type Database, type FlowDb, getCurrentVersion } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * PIPE-ORCHESTRATOR lát E: Thử AI (web) và job `pipeline` (worker) dùng CHUNG `loadWorkspaceKnowledge`. Cùng câu hỏi + cùng phiên
 * bản KB → hai đường cho CÙNG nguồn và CÙNG điểm. Đường web chạy trong `withWorkspace` (cùng RLS như `withActor`), đường worker
 * trong `withJob`; chỉ khác tham số `tx`/`version`.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let draftChunk: string;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 4 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop kiến thức',
    `shop-${ws}`,
  ]);
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
  const chunk = (key: string, content: string, draft: boolean) =>
    admin.query(
      `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
       VALUES ($1, $2, $3, $4, $5, 'vi', $6, $7) RETURNING id`,
      [ws, src, draft ? null : ver, key, content, `h-${key}`, draft],
    );
  await chunk('ship-1', 'Phí ship nội thành 20.000đ, giao trong 2 ngày', false);
  await chunk('doi-tra', 'Đổi trả trong 7 ngày nếu còn tem mác', false);
  draftChunk = (await chunk('ban-nhap', 'Phí ship nháp 99.000đ chưa xuất bản', true)).rows[0].id;
  await admin.query(
    "INSERT INTO cf.products (workspace_id, name, search_text, price_vnd, stock, status) VALUES ($1, 'Áo thun basic', 'ao thun basic', 150000, 5, 'active')",
    [ws],
  );
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const base: TryKnowledge = {
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  searchKb: async () => [],
};

async function load(tx: Database) {
  const version = await getCurrentVersion(tx, ws);
  const loaded = await loadWorkspaceKnowledge({
    tx,
    workspaceId: ws,
    version,
    productsEnabled: true,
    base,
  });
  if (!loaded) throw new Error('không có kiến thức');
  const hits = await loaded.knowledge.searchKb('phí ship nội thành bao nhiêu', {
    lang: 'vi',
    productIds: [],
  });
  const match = await loaded.knowledge.matchProducts(['Áo thun basic']);
  const facts = await loaded.knowledge.lookupProductFacts(match.ids);
  return { source: loaded.source, hits, match, facts, context: loaded.context };
}

describe('cùng một hàm tìm kiến thức cho Thử AI và worker', () => {
  it('cùng câu hỏi + cùng phiên bản KB → cùng nguồn, cùng điểm, cùng sản phẩm', async () => {
    const web = await db.withWorkspace(ws, (tx) => load(tx));
    const worker = await db.withJob(ws, (tx) => load(tx));
    expect(web.source).toBe('kb');
    expect(worker.source).toBe('kb');
    expect(worker.hits.map((h) => [h.id, h.score])).toEqual(web.hits.map((h) => [h.id, h.score]));
    expect(worker.hits.length).toBeGreaterThan(0);
    expect(worker.match).toEqual(web.match);
    expect(worker.facts.map((f) => [f.id, f.text, f.score])).toEqual(
      web.facts.map((f) => [f.id, f.text, f.score]),
    );
    expect(worker.facts).toHaveLength(1);
  });

  it('chỉ đọc phiên bản ĐÃ XUẤT BẢN: đoạn nháp không bao giờ xuất hiện (cả hai đường)', async () => {
    const worker = await db.withJob(ws, (tx) => load(tx));
    const web = await db.withWorkspace(ws, (tx) => load(tx));
    for (const r of [worker, web]) {
      expect(r.hits.map((h) => h.id)).not.toContain(`kb:${draftChunk}`);
      expect(r.hits.map((h) => h.text).join(' ')).not.toContain('99.000');
    }
  });

  it('workspace chưa có dữ liệu thật nào và không có phiên bản → null (nơi gọi dùng mẫu)', async () => {
    const empty = randomUUID();
    await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
      empty,
      'Trống',
      `shop-${empty}`,
    ]);
    const out = await db.withJob(empty, (tx) =>
      loadWorkspaceKnowledge({
        tx,
        workspaceId: empty,
        version: null,
        productsEnabled: true,
        base,
      }),
    );
    expect(out).toBeNull();
  });
});
