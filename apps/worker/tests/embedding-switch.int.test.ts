import { randomUUID } from 'node:crypto';
import { createFixtureEmbedder, type Embedder } from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runEmbeddingSwitch } from '../src/embedding-switch';

/**
 * `kb:switch-embedding` trên DB thật (FR-133, Q-EMB-1): tạo vector mới cho TOÀN BỘ dữ liệu của mọi workspace, đủ 100% mới đổi model hoạt động trong
 * một giao dịch; bị ngắt giữa chừng → model cũ và vector cũ vẫn nguyên, truy vấn vẫn dùng được; chạy lại tiếp tục và hoàn tất.
 */
let db: FlowDb;
let admin: pg.Pool;
let wsA: string;
let wsB: string;
const OLD = 'model-cu';
const unit = (i: number): number[] => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
const lit = (v: number[]) => `[${v.join(',')}]`;
const logger = { info: () => {}, warn: () => {}, error: () => {} };

const fixture = createFixtureEmbedder();
const TARGET = fixture.model;

async function seedWorkspace(): Promise<string> {
  const id = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    id,
    'Shop đổi model',
    `sw-${id}`,
  ]);
  const src = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'F') RETURNING id",
      [id],
    )
  ).rows[0].id;
  const ver = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [id],
    )
  ).rows[0].id;
  for (const [i, kind] of [
    [0, 'nháp'],
    [1, 'xuất bản'],
  ] as const) {
    await admin.query(
      `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft, embedding, embedding_model)
       VALUES ($1, $2, $3, $4, $5, 'vi', $6, $7, $8::halfvec, $9)`,
      [
        id,
        src,
        i === 1 ? ver : null,
        `k${i}`,
        `phí ship ${kind}`,
        `h${i}`,
        i === 0,
        lit(unit(1)),
        OLD,
      ],
    );
  }
  for (const name of ['Gối massage cổ', 'Áo thun basic']) {
    await admin.query(
      `INSERT INTO cf.products (workspace_id, name, search_text, price_vnd, name_embedding, name_embedding_model)
       VALUES ($1, $2, $2, 1000, $3::halfvec, $4)`,
      [id, name, lit(unit(2)), OLD],
    );
  }
  return id;
}

const stateOf = async () =>
  (
    await admin.query(
      'SELECT active_model, pending_model, revision::int AS revision FROM cf.embedding_state',
    )
  ).rows[0] as { active_model: string | null; pending_model: string | null; revision: number };

async function rowModels(ws: string) {
  const chunks = (
    await admin.query(
      'SELECT DISTINCT embedding_model AS m FROM cf.kb_chunks WHERE workspace_id = $1',
      [ws],
    )
  ).rows.map((r) => r.m as string | null);
  const products = (
    await admin.query(
      'SELECT DISTINCT name_embedding_model AS m FROM cf.products WHERE workspace_id = $1',
      [ws],
    )
  ).rows.map((r) => r.m as string | null);
  return { chunks, products };
}

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 4 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
});

afterAll(async () => {
  await admin.query('UPDATE cf.embedding_state SET active_model = NULL, pending_model = NULL');
  await db.close();
  await admin.end();
});

beforeEach(async () => {
  // Đổi model là TOÀN CỤC: dọn dữ liệu còn sót từ file test trước (DB test, chạy tuần tự).
  await admin.query('TRUNCATE cf.kb_chunks, cf.products CASCADE');
  await admin.query('UPDATE cf.embedding_state SET active_model = $1, pending_model = NULL', [OLD]);
  wsA = await seedWorkspace();
  wsB = await seedWorkspace();
});

describe('runEmbeddingSwitch', () => {
  it('đổi toàn bộ dữ liệu của MỌI workspace sang model đích, một lần, và model hoạt động đổi theo', async () => {
    const before = await stateOf();
    const result = await runEmbeddingSwitch({ db, embedder: fixture, model: TARGET, logger });
    expect(result).toMatchObject({ status: 'switched', model: TARGET });
    expect(result.status === 'switched' && result.staged).toEqual({ chunks: 4, products: 4 });
    const after = await stateOf();
    expect(after).toMatchObject({ active_model: TARGET, pending_model: null });
    expect(after.revision).toBe(before.revision + 1);
    for (const ws of [wsA, wsB]) {
      expect(await rowModels(ws)).toEqual({ chunks: [TARGET], products: [TARGET] });
    }
    const leftovers = (
      await admin.query(
        'SELECT (SELECT count(*) FROM cf.kb_chunks WHERE embedding_next IS NOT NULL)::int AS c, (SELECT count(*) FROM cf.products WHERE name_embedding_next IS NOT NULL)::int AS p',
      )
    ).rows[0];
    expect(leftovers).toEqual({ c: 0, p: 0 });
  });

  it('NGẮT giữa chừng (embedder lỗi sau vài lần gọi) → model cũ + vector cũ NGUYÊN VẸN; chạy lại hoàn tất', async () => {
    let calls = 0;
    const flaky: Embedder = {
      model: TARGET,
      embed: async (texts) => {
        if (++calls > 2) throw new Error('dịch vụ ml chết giữa chừng');
        return fixture.embed(texts);
      },
    };
    await expect(
      runEmbeddingSwitch({ db, embedder: flaky, model: TARGET, logger }),
    ).rejects.toThrow(/ml chết/);
    const mid = await stateOf();
    expect(mid.active_model).toBe(OLD); // model cũ giữ nguyên
    expect(mid.pending_model).toBe(TARGET);
    for (const ws of [wsA, wsB]) {
      expect(await rowModels(ws)).toEqual({ chunks: [OLD], products: [OLD] });
    }
    const oldVec = (
      await admin.query(
        'SELECT count(*)::int AS n FROM cf.kb_chunks WHERE embedding_model = $1 AND embedding IS NOT NULL',
        [OLD],
      )
    ).rows[0].n;
    expect(oldVec).toBe(4); // truy vấn model cũ vẫn có dữ liệu để so

    const done = await runEmbeddingSwitch({ db, embedder: fixture, model: TARGET, logger });
    expect(done.status).toBe('switched');
    expect((await stateOf()).active_model).toBe(TARGET);
    expect(await rowModels(wsA)).toEqual({ chunks: [TARGET], products: [TARGET] });
  });

  it('model đích đã hoạt động → không làm gì', async () => {
    await runEmbeddingSwitch({ db, embedder: fixture, model: TARGET, logger });
    const again = await runEmbeddingSwitch({ db, embedder: fixture, model: TARGET, logger });
    expect(again).toEqual({ status: 'already_active', model: TARGET });
  });

  it('embedder không đúng model đích → từ chối TRƯỚC khi đụng dữ liệu', async () => {
    await expect(
      runEmbeddingSwitch({ db, embedder: fixture, model: 'model-khac', logger }),
    ).rejects.toThrow(/model-khac/);
    const s = await stateOf();
    expect(s).toMatchObject({ active_model: OLD, pending_model: null });
  });
});
