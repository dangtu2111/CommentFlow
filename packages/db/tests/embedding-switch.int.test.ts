import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  beginEmbeddingSwitch,
  getEmbeddingState,
  listChunksForSwitch,
  listEmbeddingSwitchPending,
  listProductsForSwitch,
  switchActiveEmbedding,
  writeChunksNext,
  writeProductsNext,
} from '../src/queries/embedding-state';
import { searchKbChunks, searchProducts, setProductNameEmbedding } from '../src/queries/kb-search';
import {
  createAdminPool,
  createAppDb,
  createWebDb,
  createWorkerDb,
  seedMember,
  seedUser,
  seedWorkspace,
  setActiveEmbeddingModel,
} from './helpers';

/**
 * EMBED-ACTIVE-MODEL (0079): lệch model KHÔNG THỂ xảy ra.
 *  - đường runtime (cf_app/cf_worker) KHÔNG ghi được vector với model khác model đang hoạt động (trigger DB);
 *  - đổi model chỉ qua hàm DEFINER của worker: đủ 100% mới đổi, một giao dịch; ngắt giữa chừng → model cũ vẫn chạy đúng.
 */

let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let app: FlowDb;
let ws: string;
let owner: string;

const unit = (i: number): number[] => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
const lit = (v: number[]) => `[${v.join(',')}]`;

async function seedChunk(key: string, vec: number[], model: string): Promise<string> {
  const src = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', $2) RETURNING id",
      [ws, key],
    )
  ).rows[0].id;
  const ver = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, (SELECT coalesce(max(number),0)+1 FROM cf.kb_versions WHERE workspace_id = $1)) RETURNING id',
      [ws],
    )
  ).rows[0].id;
  const id = (
    await admin.query(
      `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft, embedding, embedding_model)
       VALUES ($1, $2, $3, $4, $5, 'vi', $6, false, $7::halfvec, $8) RETURNING id`,
      [ws, src, ver, key, `phí ship ${key}`, `h-${key}`, lit(vec), model],
    )
  ).rows[0].id as string;
  return id;
}

async function seedProduct(name: string, vec: number[], model: string): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.products (workspace_id, name, search_text, price_vnd, name_embedding, name_embedding_model)
       VALUES ($1, $2, $2, 1000, $3::halfvec, $4) RETURNING id`,
      [ws, name, lit(vec), model],
    )
  ).rows[0].id as string;
}

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb(3);
  app = createAppDb();
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin);
  await seedMember(admin, ws, owner, 'owner');
});

afterAll(async () => {
  await setActiveEmbeddingModel(admin, null);
  await web.close();
  await worker.close();
  await app.close();
  await admin.end();
});

beforeEach(async () => {
  // Đổi model là TOÀN CỤC (đòi 100% dòng của mọi workspace): dọn vector còn sót từ các file test trước (DB test, chạy tuần tự).
  await admin.query('TRUNCATE cf.kb_chunks, cf.products CASCADE');
  await admin.query('UPDATE cf.kb_chunks SET embedding_next = NULL, embedding_next_model = NULL');
  await admin.query(
    'UPDATE cf.products SET name_embedding_next = NULL, name_embedding_next_model = NULL',
  );
  await setActiveEmbeddingModel(admin, 'm1');
});

describe('trigger: đường runtime không ghi được vector khác model đang hoạt động', () => {
  it('chưa kích hoạt model (NULL) → runtime không ghi được vector nào', async () => {
    await setActiveEmbeddingModel(admin, null);
    const p = await seedProduct('Áo', unit(1), 'm1');
    await expect(
      app.withActor(ws, owner, (tx) => setProductNameEmbedding(tx, ws, p, unit(2), 'm1')),
    ).rejects.toThrow();
  });

  it('ghi vector tên sản phẩm: đúng model hoạt động → được; model khác → lỗi 23514, giá trị cũ giữ nguyên', async () => {
    const p = await seedProduct('Áo', unit(1), 'm1');
    expect(
      await app.withActor(ws, owner, (tx) => setProductNameEmbedding(tx, ws, p, unit(2), 'm1')),
    ).toBe(true);
    await expect(
      app.withActor(ws, owner, (tx) => setProductNameEmbedding(tx, ws, p, unit(3), 'm2')),
    ).rejects.toThrow(/model/);
    const row = (
      await admin.query('SELECT name_embedding_model AS m FROM cf.products WHERE id = $1', [p])
    ).rows[0];
    expect(row.m).toBe('m1');
  });

  it('ghi vector đoạn kiến thức (cf_worker): model khác active → lỗi; đúng → được', async () => {
    const id = await seedChunk('a', unit(1), 'm1');
    const set = (model: string) =>
      worker.withJob(ws, async (tx) => {
        await tx.execute(
          sql`UPDATE cf.kb_chunks SET embedding = ${lit(unit(5))}::halfvec, embedding_model = ${model} WHERE id = ${id}::uuid`,
        );
      });
    await expect(set('m2')).rejects.toThrow();
    await expect(set('m1')).resolves.toBeUndefined();
  });

  it('chủ sở hữu/admin (dựng dữ liệu, migration) không bị trigger chặn', async () => {
    await expect(seedChunk('b', unit(1), 'bat-ky-model')).resolves.toBeDefined();
  });

  it('web (cf_app) KHÔNG gọi được hàm đổi model', async () => {
    await expect(web.withSystem((tx) => beginEmbeddingSwitch(tx, 'm2'))).rejects.toThrow();
    await expect(
      web.withSystem((tx) => listEmbeddingSwitchPending(tx, 'm2', 10)),
    ).rejects.toThrow();
    await expect(web.withSystem((tx) => switchActiveEmbedding(tx, 'm2', 1))).rejects.toThrow();
  });
});

describe('đổi model: tạo vector mới song song, đủ 100% mới đổi, một giao dịch', () => {
  async function stageAll(model: string, vec: number[]): Promise<void> {
    await worker.withJob(ws, async (tx) => {
      const chunks = await listChunksForSwitch(tx, ws, model, 100);
      await writeChunksNext(
        tx,
        ws,
        model,
        chunks.map((c) => ({ id: c.id, contentHash: c.contentHash, embedding: vec })),
      );
      const products = await listProductsForSwitch(tx, ws, model, 100);
      await writeProductsNext(
        tx,
        ws,
        model,
        products.map((p) => ({ id: p.id, name: p.name, embedding: vec })),
      );
    });
  }

  it('luồng đầy đủ: truy vấn dùng model cũ suốt lúc tạo; đủ 100% → đổi; sau đó chỉ model mới', async () => {
    const chunk = await seedChunk('ship', unit(1), 'm1');
    const product = await seedProduct('Gối massage', unit(1), 'm1');
    const rev0 = (await worker.withSystem((tx) => getEmbeddingState(tx))).revision;

    await worker.withSystem((tx) => beginEmbeddingSwitch(tx, 'm2'));
    const mid = await worker.withSystem((tx) => getEmbeddingState(tx));
    expect(mid).toMatchObject({ activeModel: 'm1', pendingModel: 'm2' });

    await stageAll('m2', unit(7));
    // Trong lúc tạo: truy vấn vẫn dùng m1 và vẫn thấy dữ liệu m1.
    const ver = (await admin.query('SELECT version_id FROM cf.kb_chunks WHERE id = $1', [chunk]))
      .rows[0].version_id;
    const during = await app.withWorkspace(ws, (tx) =>
      searchKbChunks(tx, {
        workspaceId: ws,
        versionId: ver,
        lang: 'vi',
        queryText: 'zzz',
        queryVector: unit(1),
        embeddingModel: 'm1',
      }),
    );
    expect(during.map((h) => h.id)).toContain(chunk);

    const rev1 = await worker.withSystem((tx) => switchActiveEmbedding(tx, 'm2', rev0));
    expect(rev1).toBe(rev0 + 1);

    const after = await worker.withSystem((tx) => getEmbeddingState(tx));
    expect(after).toMatchObject({ activeModel: 'm2', pendingModel: null });
    const row = (
      await admin.query(
        'SELECT embedding_model AS m, embedding_next IS NULL AS n FROM cf.kb_chunks WHERE id = $1',
        [chunk],
      )
    ).rows[0];
    expect(row).toEqual({ m: 'm2', n: true });
    const prod = (
      await admin.query(
        'SELECT name_embedding_model AS m, name_embedding_next IS NULL AS n FROM cf.products WHERE id = $1',
        [product],
      )
    ).rows[0];
    expect(prod).toEqual({ m: 'm2', n: true });
    // Truy vấn bằng model cũ không còn khớp dòng nào (không trộn); bằng model mới khớp vector mới.
    const oldQ = await app.withWorkspace(ws, (tx) =>
      searchProducts(tx, {
        workspaceId: ws,
        queryText: 'khongtrung',
        queryVector: unit(7),
        embeddingModel: 'm1',
      }),
    );
    expect(oldQ.map((h) => h.id)).not.toContain(product);
    const newQ = await app.withWorkspace(ws, (tx) =>
      searchProducts(tx, {
        workspaceId: ws,
        queryText: 'khongtrung',
        queryVector: unit(7),
        embeddingModel: 'm2',
      }),
    );
    expect(newQ.map((h) => h.id)).toContain(product);
  });

  it('NGẮT giữa chừng (chưa đủ 100%) → hàm từ chối, TOÀN BỘ giữ nguyên model cũ và vector cũ', async () => {
    await seedChunk('x1', unit(1), 'm1');
    await seedChunk('x2', unit(1), 'm1');
    await seedProduct('Áo', unit(1), 'm1');
    const rev0 = (await worker.withSystem((tx) => getEmbeddingState(tx))).revision;
    await worker.withSystem((tx) => beginEmbeddingSwitch(tx, 'm2'));
    // chỉ tạo cho MỘT đoạn
    await worker.withJob(ws, async (tx) => {
      const [first] = await listChunksForSwitch(tx, ws, 'm2', 1);
      if (!first) throw new Error('thiếu đoạn');
      await writeChunksNext(tx, ws, 'm2', [
        { id: first.id, contentHash: first.contentHash, embedding: unit(7) },
      ]);
    });
    const refusal = await worker
      .withSystem((tx) => switchActiveEmbedding(tx, 'm2', rev0))
      .then(() => null)
      .catch((e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(refusal).toMatch(/chưa có vector đệm/);
    const state = await worker.withSystem((tx) => getEmbeddingState(tx));
    expect(state).toMatchObject({ activeModel: 'm1', revision: rev0 });
    const rows = (
      await admin.query(
        'SELECT embedding_model AS m, embedding <=> $2::halfvec AS d FROM cf.kb_chunks WHERE workspace_id = $1',
        [ws, lit(unit(1))],
      )
    ).rows;
    expect(rows.every((r) => r.m === 'm1' && Number(r.d) < 1e-6)).toBe(true);
  });

  it('dòng mới chen vào sau khi tạo đủ (chưa có vector đệm) → không chuyển; tạo thêm rồi chuyển được', async () => {
    await seedChunk('y1', unit(1), 'm1');
    const rev0 = (await worker.withSystem((tx) => getEmbeddingState(tx))).revision;
    await worker.withSystem((tx) => beginEmbeddingSwitch(tx, 'm2'));
    await stageAll('m2', unit(7));
    await seedChunk('y2', unit(1), 'm1'); // dòng mới sau khi tạo đủ
    await expect(
      worker.withSystem((tx) => switchActiveEmbedding(tx, 'm2', rev0)),
    ).rejects.toThrow();
    const pending = await worker.withSystem((tx) => listEmbeddingSwitchPending(tx, 'm2', 100));
    expect(pending.find((p) => p.workspaceId === ws)).toMatchObject({ chunks: 1 });
    await stageAll('m2', unit(7));
    await expect(worker.withSystem((tx) => switchActiveEmbedding(tx, 'm2', rev0))).resolves.toBe(
      rev0 + 1,
    );
  });

  it('ghi vector đệm sai model (khác pending) → trigger chặn; revision lệch → hàm từ chối', async () => {
    const c = await seedChunk('z1', unit(1), 'm1');
    const rev0 = (await worker.withSystem((tx) => getEmbeddingState(tx))).revision;
    await worker.withSystem((tx) => beginEmbeddingSwitch(tx, 'm2'));
    await expect(
      worker.withJob(ws, (tx) =>
        writeChunksNext(tx, ws, 'm3', [{ id: c, contentHash: 'h-z1', embedding: unit(7) }]),
      ),
    ).rejects.toThrow();
    await stageAll('m2', unit(7));
    await expect(
      worker.withSystem((tx) => switchActiveEmbedding(tx, 'm2', rev0 + 5)),
    ).rejects.toThrow();
    await expect(
      worker.withSystem((tx) => switchActiveEmbedding(tx, 'm9', rev0)),
    ).rejects.toThrow();
  });

  it('begin đổi sang model khác xóa vector đệm của model trước (không lẫn đệm hai model)', async () => {
    await seedChunk('w1', unit(1), 'm1');
    await worker.withSystem((tx) => beginEmbeddingSwitch(tx, 'm2'));
    await stageAll('m2', unit(7));
    await worker.withSystem((tx) => beginEmbeddingSwitch(tx, 'm3'));
    const left = (
      await admin.query(
        'SELECT count(*)::int AS n FROM cf.kb_chunks WHERE workspace_id = $1 AND embedding_next IS NOT NULL',
        [ws],
      )
    ).rows[0].n;
    expect(left).toBe(0);
  });
});
