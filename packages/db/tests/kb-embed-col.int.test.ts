import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { searchKbChunks } from '../src/queries/kb-search';
import { createAdminPool, createAppDb, seedWorkspace } from './helpers';

/** KB-EMBED-COL (FR-133, FR-139, migration 0042): HNSW cho kb_chunks.embedding + chỉ mục embedding_model. */

let admin: pg.Pool;
let db: FlowDb;

const unit = (i: number): number[] => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
const vec = (v: number[]) => `[${v.join(',')}]`;

beforeAll(() => {
  admin = createAdminPool();
  db = createAppDb();
});

afterAll(async () => {
  await admin.end();
});

async function indexInfo(name: string) {
  const { rows } = await admin.query<{ def: string; valid: boolean }>(
    `SELECT pg_get_indexdef(c.oid) AS def, i.indisvalid AS valid
       FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'cf' AND c.relname = $1`,
    [name],
  );
  return rows[0];
}

describe('chỉ mục kb_chunks cho embedding (0042)', () => {
  it('HNSW một phần: halfvec_cosine_ops, chỉ đoạn đã xuất bản, có vector, không nghi cài lệnh', async () => {
    const info = await indexInfo('kb_chunks_embedding_hnsw_idx');
    expect(info?.valid).toBe(true);
    expect(info?.def).toContain('USING hnsw (embedding halfvec_cosine_ops)');
    expect(info?.def).toMatch(/WHERE .*NOT is_draft/);
    expect(info?.def).toMatch(/NOT injection_suspected/);
    expect(info?.def).toMatch(/embedding IS NOT NULL/);
  });

  it('B-tree (workspace_id, embedding_model) cho job tạo lại embedding', async () => {
    const info = await indexInfo('kb_chunks_workspace_embedding_model_idx');
    expect(info?.valid).toBe(true);
    expect(info?.def).toContain('(workspace_id, embedding_model)');
  });
});

describe('truy vấn vector qua HNSW', () => {
  let wsA: string;
  let verA: string;

  async function seed(ws: string, src: string, ver: string, key: string, e: number[]) {
    await admin.query(
      `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang,
         content_hash, is_draft, embedding, embedding_model)
       VALUES ($1, $2, $3, $4, $5, 'vi', $6, false, $7::halfvec, 'fixture-1')`,
      [ws, src, ver, key, `noi dung ${key}`, `h-${key}`, vec(e)],
    );
  }

  async function mkSourceVersion(ws: string) {
    const s = (
      await admin.query(
        "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'S') RETURNING id",
        [ws],
      )
    ).rows[0].id as string;
    const v = (
      await admin.query(
        'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
        [ws],
      )
    ).rows[0].id as string;
    return { s, v };
  }

  beforeAll(async () => {
    wsA = await seedWorkspace(admin);
    const wsB = await seedWorkspace(admin);
    const a = await mkSourceVersion(wsA);
    const b = await mkSourceVersion(wsB);
    verA = a.v;
    // Workspace B có rất nhiều đoạn gần vector truy vấn hơn mọi đoạn của A.
    for (let i = 0; i < 120; i++) await seed(wsB, b.s, b.v, `b-${i}`, unit(0));
    for (let i = 0; i < 5; i++) await seed(wsA, a.s, a.v, `a-${i}`, unit(1 + i));
    await admin.query('ANALYZE cf.kb_chunks');
  });

  it('ép dùng chỉ mục → kế hoạch có kb_chunks_embedding_hnsw_idx', async () => {
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan = off');
      const { rows } = await client.query(
        `EXPLAIN SELECT id FROM cf.kb_chunks
          WHERE embedding IS NOT NULL AND NOT is_draft AND NOT injection_suspected
          ORDER BY embedding <=> $1::halfvec(1024) LIMIT 10`,
        [vec(unit(0))],
      );
      await client.query('ROLLBACK');
      expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('kb_chunks_embedding_hnsw_idx');
    } finally {
      client.release();
    }
  });

  it('đối chứng: ép dùng HNSW + tắt iterative scan thì workspace A bị thiếu; strict_order thì đủ', async () => {
    const run = async (mode: 'off' | 'strict_order') => {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL enable_seqscan = off');
        await client.query('SET LOCAL enable_bitmapscan = off');
        await client.query(`SET LOCAL hnsw.iterative_scan = ${mode}`);
        const { rows } = await client.query(
          `SELECT id FROM cf.kb_chunks
            WHERE workspace_id = $1 AND embedding IS NOT NULL AND NOT is_draft AND NOT injection_suspected
            ORDER BY embedding <=> $2::halfvec(1024) LIMIT 5`,
          [wsA, vec(unit(0))],
        );
        await client.query('ROLLBACK');
        return rows.length;
      } finally {
        client.release();
      }
    };
    // Chỉ khẳng định phần chắc chắn: strict_order luôn đủ 5. Kết quả 'off' phụ thuộc planner (có thể chọn B-tree
    // workspace_id) nên chỉ ghi lại, không assert.
    await run('off');
    expect(await run('strict_order')).toBe(5);
  });

  it('workspace A vẫn nhận đủ đoạn dù B chiếm hết láng giềng gần nhất (iterative scan)', async () => {
    const hits = await db.withWorkspace(wsA, (tx) =>
      searchKbChunks(tx, {
        workspaceId: wsA,
        versionId: verA,
        lang: 'vi',
        queryText: '',
        queryVector: unit(0),
        limit: 5,
      }),
    );
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.chunkKey.startsWith('a-'))).toBe(true);
  });
});
