import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { countEmbeddingModels } from '../src/queries/embedding-models';
import { createAdminPool, createAppDb, createWorkerDb, seedWorkspace } from './helpers';

/** EMBED-MODEL-MISMATCH-GUARD: đếm vector theo model (đoạn đã xuất bản + tên sản phẩm), cô lập theo workspace. */

let admin: pg.Pool;
let db: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;

const vec = `[${Array.from({ length: 1024 }, (_, k) => (k === 0 ? 1 : 0)).join(',')}]`;

async function chunk(w: string, key: string, draft: boolean, model: string | null, withVec = true) {
  const src = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', $2) RETURNING id",
      [w, key],
    )
  ).rows[0].id;
  const ver = draft
    ? null
    : (
        await admin.query(
          'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, (SELECT coalesce(max(number),0)+1 FROM cf.kb_versions WHERE workspace_id = $1)) RETURNING id',
          [w],
        )
      ).rows[0].id;
  await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft, embedding, embedding_model)
     VALUES ($1, $2, $3, $4, 'x', 'vi', $5, $6, $7::halfvec, $8)`,
    [w, src, ver, key, `h-${key}`, draft, withVec ? vec : null, model],
  );
}

async function product(w: string, name: string, model: string | null, withVec = true) {
  await admin.query(
    `INSERT INTO cf.products (workspace_id, name, search_text, price_vnd, name_embedding, name_embedding_model)
     VALUES ($1, $2, $2, 1000, $3::halfvec, $4)`,
    [w, name, withVec ? vec : null, model],
  );
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  worker = createWorkerDb(2);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  await chunk(ws, 'a', false, 'bge-m3');
  await chunk(ws, 'b', false, 'bge-m3');
  await chunk(ws, 'c', false, 'fixture-trigram-1024');
  await chunk(ws, 'd', false, null); // vector không rõ model
  await chunk(ws, 'e', true, 'nhap-model'); // bản nháp: không tính
  await chunk(ws, 'f', false, 'khong-vector', false); // không có vector: không tính
  await product(ws, 'p1', 'bge-m3');
  await product(ws, 'p2', null); // vector cũ trước cột model
  await product(ws, 'p3', 'bge-m3', false); // không có vector: không tính
  await chunk(other, 'o', false, 'model-cua-workspace-khac');
});

afterAll(async () => {
  await db.close();
  await worker.close();
  await admin.end();
});

describe('countEmbeddingModels', () => {
  it('đếm đoạn ĐÃ XUẤT BẢN có vector theo model (NULL → rỗng); bỏ nháp và đoạn không vector; sản phẩm theo name_embedding_model', async () => {
    const counts = await db.withWorkspace(ws, (tx) => countEmbeddingModels(tx, ws));
    const byModel = (rows: Array<{ model: string; count: number }>) =>
      Object.fromEntries(rows.map((r) => [r.model, r.count]));
    expect(byModel(counts.chunks)).toEqual({
      'bge-m3': 2,
      'fixture-trigram-1024': 1,
      '': 1,
    });
    expect(byModel(counts.products)).toEqual({ 'bge-m3': 1, '': 1 });
  });

  it('không lộ dữ liệu workspace khác', async () => {
    const counts = await db.withWorkspace(ws, (tx) => countEmbeddingModels(tx, ws));
    expect(JSON.stringify(counts)).not.toContain('model-cua-workspace-khac');
  });

  it('chạy được bằng withJob của worker (kiểm khi khởi động theo từng workspace)', async () => {
    const counts = await worker.withJob(ws, (tx) => countEmbeddingModels(tx, ws));
    expect(counts.chunks.map((c) => c.model)).toContain('bge-m3');
    expect(JSON.stringify(counts)).not.toContain('model-cua-workspace-khac');
  });
});
