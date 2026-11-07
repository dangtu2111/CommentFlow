import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  countChunksByEmbeddingModel,
  countChunksToReembed,
  listChunksToReembed,
  writeReembeddedChunks,
} from '../src/queries/kb-reembed';
import { searchKbChunks } from '../src/queries/kb-search';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** PGVECTOR-HYBRID (FR-133): tạo lại embedding khi đổi mô hình — RLS, bất biến nội dung, cách ly workspace. */

let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let verA: string;
let srcA: string;
let srcB: string;
let owner: string;

const unit = (i: number): number[] => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
const vec = (v: number[]) => `[${v.join(',')}]`;

async function seedChunk(
  ws: string,
  src: string,
  ver: string | null,
  key: string,
  opts: { model: string | null; embedding?: number[]; draft?: boolean } = { model: null },
): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash,
       is_draft, embedding, embedding_model)
     VALUES ($1, $2, $3, $4, $5, 'vi', $6, $7, $8::halfvec, $9) RETURNING id`,
    [
      ws,
      src,
      ver,
      key,
      `nội dung ${key}`,
      `h-${key}`,
      opts.draft ?? ver === null,
      opts.embedding ? vec(opts.embedding) : null,
      opts.model,
    ],
  );
  return r.rows[0].id as string;
}

const rowOf = async (id: string) =>
  (
    await admin.query(
      'SELECT content, content_hash, tsv::text AS tsv, version_id, is_draft, embedding_model FROM cf.kb_chunks WHERE id = $1',
      [id],
    )
  ).rows[0];

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin);
  await seedMember(admin, wsA, owner, 'owner');
  const source = (ws: string) =>
    admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'S') RETURNING id",
      [ws],
    );
  srcA = (await source(wsA)).rows[0].id;
  srcB = (await source(wsB)).rows[0].id;
  verA = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [wsA],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-133 tạo lại embedding (withJob)', () => {
  it('chỉ liệt kê đoạn khác mô hình đích (kể cả NULL), không lẫn workspace khác', async () => {
    await seedChunk(wsA, srcA, verA, 'ls-old', { model: 'old', embedding: unit(1) });
    await seedChunk(wsA, srcA, verA, 'ls-null', { model: null });
    await seedChunk(wsA, srcA, verA, 'ls-new', { model: 'new-m', embedding: unit(2) });
    await seedChunk(wsB, srcB, null, 'ls-other-ws', { model: 'old', embedding: unit(3) });
    const list = await db.withJob(wsA, (tx) => listChunksToReembed(tx, wsA, 'new-m', 100));
    expect(list.map((c) => c.content).sort()).toEqual(['nội dung ls-null', 'nội dung ls-old']);
    expect(
      await db.withJob(wsA, (tx) => countChunksToReembed(tx, wsA, 'new-m')),
    ).toBeGreaterThanOrEqual(2);
  });

  it('đếm đoạn theo mô hình embedding (NULL → chuỗi rỗng), không lẫn workspace khác', async () => {
    await seedChunk(wsA, srcA, verA, 'cm-a1', { model: 'model-x', embedding: unit(1) });
    await seedChunk(wsA, srcA, verA, 'cm-a2', { model: 'model-x', embedding: unit(2) });
    await seedChunk(wsA, srcA, verA, 'cm-null', { model: null });
    await seedChunk(wsB, srcB, null, 'cm-b', { model: 'model-x', embedding: unit(3) });
    const rows = await db.withJob(wsA, (tx) => countChunksByEmbeddingModel(tx, wsA));
    const count = (model: string) => rows.find((row) => row.model === model)?.count ?? 0;
    expect(count('model-x')).toBeGreaterThanOrEqual(2);
    expect(count('')).toBeGreaterThanOrEqual(1);
    const other = await db.withJob(wsB, (tx) => countChunksByEmbeddingModel(tx, wsB));
    expect(other.find((row) => row.model === 'model-x')?.count).toBeGreaterThanOrEqual(1);
    expect(other.find((row) => row.model === '')?.count ?? 0).toBe(0);
  });

  it('ghi vector + mô hình; KHÔNG đổi content/hash/tsv/phiên bản/nháp (đoạn đã xuất bản và bản nháp)', async () => {
    const published = await seedChunk(wsA, srcA, verA, 'wr-pub', {
      model: 'old',
      embedding: unit(1),
    });
    const draft = await seedChunk(wsA, srcA, null, 'wr-draft', {
      model: 'old',
      embedding: unit(1),
    });
    const before = [await rowOf(published), await rowOf(draft)];
    const written = await db.withJob(wsA, (tx) =>
      writeReembeddedChunks(tx, wsA, 'new-m', [
        { id: published, contentHash: 'h-wr-pub', embedding: unit(7) },
        { id: draft, contentHash: 'h-wr-draft', embedding: unit(8) },
      ]),
    );
    expect(written).toBe(2);
    for (const [i, id] of [published, draft].entries()) {
      const after = await rowOf(id);
      expect(after.embedding_model).toBe('new-m');
      expect({ ...after, embedding_model: null }).toEqual({ ...before[i], embedding_model: null });
    }
    const dist = await admin.query(
      'SELECT embedding <=> $2::halfvec AS d FROM cf.kb_chunks WHERE id = $1',
      [published, vec(unit(7))],
    );
    expect(Number(dist.rows[0].d)).toBeCloseTo(0, 3);
  });

  it('content_hash lệch (đoạn đổi giữa chừng) → không ghi', async () => {
    const id = await seedChunk(wsA, srcA, null, 'wr-race', { model: 'old', embedding: unit(1) });
    const written = await db.withJob(wsA, (tx) =>
      writeReembeddedChunks(tx, wsA, 'new-m', [
        { id, contentHash: 'stale-hash', embedding: unit(9) },
      ]),
    );
    expect(written).toBe(0);
    expect((await rowOf(id)).embedding_model).toBe('old');
  });

  it('chéo workspace: job của A không ghi được đoạn của B', async () => {
    const other = await seedChunk(wsB, srcB, null, 'x-ws-b', { model: 'old', embedding: unit(1) });
    const written = await db.withJob(wsA, (tx) =>
      writeReembeddedChunks(tx, wsA, 'new-m', [
        { id: other, contentHash: 'h-x-ws-b', embedding: unit(9) },
      ]),
    );
    expect(written).toBe(0);
    expect((await rowOf(other)).embedding_model).toBe('old');
  });

  it('ngoài withJob (thành viên Owner) → RLS chặn: không ghi được hàng nào', async () => {
    const id = await seedChunk(wsA, srcA, null, 'wr-rls', { model: 'old', embedding: unit(1) });
    const written = await db.withActor(wsA, owner, (tx) =>
      writeReembeddedChunks(tx, wsA, 'new-m', [
        { id, contentHash: 'h-wr-rls', embedding: unit(9) },
      ]),
    );
    expect(written).toBe(0);
    expect((await rowOf(id)).embedding_model).toBe('old');
  });
});

describe('FR-133 searchKbChunks lọc nhánh vector theo mô hình', () => {
  it('có embeddingModel → chỉ đoạn cùng mô hình ở nhánh vector; không truyền → như cũ', async () => {
    const match = await seedChunk(wsA, srcA, verA, 'sm-match', {
      model: 'm-new',
      embedding: unit(40),
    });
    const stale = await seedChunk(wsA, srcA, verA, 'sm-stale', {
      model: 'm-old',
      embedding: unit(40),
    });
    const run = (embeddingModel?: string) =>
      db.withWorkspace(wsA, (tx) =>
        searchKbChunks(tx, {
          workspaceId: wsA,
          versionId: verA,
          lang: 'vi',
          queryText: '',
          queryVector: unit(40),
          embeddingModel,
          limit: 50,
        }),
      );
    const ids = (await run('m-new')).map((h) => h.id);
    expect(ids).toContain(match);
    expect(ids).not.toContain(stale);
    const all = (await run()).map((h) => h.id);
    expect(all).toEqual(expect.arrayContaining([match, stale]));
  });
});
