import { isProductCacheStale, normalizeSearchText, productSearchText } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  findProductMatch,
  getProductRevs,
  searchKbChunks,
  searchProducts,
  setProductNameEmbedding,
} from '../src/queries/kb-search';
import {
  createAdminPool,
  createAppDb,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
  setActiveEmbeddingModel,
} from './helpers';

/** KB-SEARCH-FTS (FR-057, FR-127, FR-135): trigger tsv/search_norm, tìm lai RRF, tìm sản phẩm, cache theo rev. */

let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let verA: string;
let verB: string;
let srcA: string;
let srcB: string;
let owner: string;

/** Vector đơn vị cho cạnh `i` (1024 chiều): cosine = 1 nếu cùng cạnh, 0 nếu khác. */
const unit = (i: number): number[] => Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0));
const vec = (v: number[]) => `[${v.join(',')}]`;

async function seedChunk(
  ws: string,
  src: string,
  ver: string | null,
  key: string,
  content: string,
  opts: {
    lang?: 'vi' | 'en';
    header?: string | null;
    embedding?: number[] | null;
    validFrom?: string | null;
    validUntil?: string | null;
    productId?: string | null;
    injection?: boolean;
  } = {},
): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash,
       is_draft, context_header, embedding, valid_from, valid_until, product_id, injection_suspected)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::halfvec, $11, $12, $13, $14) RETURNING id`,
    [
      ws,
      src,
      ver,
      key,
      content,
      opts.lang ?? 'vi',
      `h-${key}`,
      ver === null,
      opts.header ?? null,
      opts.embedding ? vec(opts.embedding) : null,
      opts.validFrom ?? null,
      opts.validUntil ?? null,
      opts.productId ?? null,
      opts.injection ?? false,
    ],
  );
  return r.rows[0].id as string;
}

async function seedProduct(
  ws: string,
  name: string,
  opts: { status?: string; price?: number; embedding?: number[]; model?: string } = {},
): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.products (workspace_id, name, search_text, price_vnd, status, name_embedding, name_embedding_model)
     VALUES ($1, $2, $3, $4, $5, $6::halfvec, $7) RETURNING id`,
    [
      ws,
      name,
      productSearchText({ name }),
      opts.price ?? 100000,
      opts.status ?? 'active',
      opts.embedding ? vec(opts.embedding) : null,
      opts.embedding ? (opts.model ?? 'bge-m3') : null,
    ],
  );
  return r.rows[0].id as string;
}

const search = (
  ws: string,
  ver: string,
  queryText: string,
  extra: Partial<Parameters<typeof searchKbChunks>[1]> = {},
) =>
  db.withWorkspace(ws, (tx) =>
    searchKbChunks(tx, {
      workspaceId: ws,
      versionId: ver,
      lang: 'vi',
      queryText,
      ...extra,
    }),
  );

beforeAll(async () => {
  admin = createAdminPool();
  await setActiveEmbeddingModel(admin, 'bge-m3');
  db = createAppDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin);
  await seedMember(admin, wsA, owner, 'owner');
  srcA = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'A') RETURNING id",
      [wsA],
    )
  ).rows[0].id;
  srcB = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'B') RETURNING id",
      [wsB],
    )
  ).rows[0].id;
  verA = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [wsA],
    )
  ).rows[0].id;
  verB = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [wsB],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-057 trigger điền search_norm và tsv', () => {
  it('vi: search_norm thường + không dấu (đ→d), gồm context_header; tsv tìm được không dấu', async () => {
    const id = await seedChunk(wsA, srcA, verA, 'trg-vi', 'Đổi trả trong 7 ngày', {
      header: 'Chính sách › Đổi trả',
    });
    const row = (
      await admin.query(
        `SELECT search_norm, tsv @@ to_tsquery('simple', 'doi') AS hit_doi,
                tsv @@ to_tsquery('simple', 'chinh') AS hit_header
           FROM cf.kb_chunks WHERE id = $1`,
        [id],
      )
    ).rows[0];
    expect(row.search_norm).toContain('doi tra trong 7 ngay');
    expect(row.search_norm).toContain('chinh sach');
    expect(row.hit_doi).toBe(true);
    expect(row.hit_header).toBe(true);
  });

  it('en: dùng english (stemming): "shirts" khớp "shirt"', async () => {
    const id = await seedChunk(wsA, srcA, verA, 'trg-en', 'Cotton shirt care guide', {
      lang: 'en',
    });
    const row = (
      await admin.query(
        "SELECT tsv @@ to_tsquery('english', 'shirts') AS hit FROM cf.kb_chunks WHERE id = $1",
        [id],
      )
    ).rows[0];
    expect(row.hit).toBe(true);
  });

  it('cập nhật content hoặc lang tính lại; tsv worker truyền vào bị ghi đè', async () => {
    const id = await seedChunk(wsA, srcA, verA, 'trg-upd', 'bảo hành một năm');
    await admin.query(
      "UPDATE cf.kb_chunks SET content = 'miễn phí vận chuyển', tsv = to_tsvector('simple', 'rac') WHERE id = $1",
      [id],
    );
    const row = (
      await admin.query(
        `SELECT search_norm, tsv @@ to_tsquery('simple', 'van') AS hit,
                tsv @@ to_tsquery('simple', 'rac') AS junk FROM cf.kb_chunks WHERE id = $1`,
        [id],
      )
    ).rows[0];
    expect(row.search_norm).toContain('mien phi van chuyen');
    expect(row.hit).toBe(true);
    expect(row.junk).toBe(false);
  });
});

describe('FR-057 searchKbChunks (RRF vector + toàn văn + trigram)', () => {
  it('toàn văn không dấu ra đoạn đúng, xếp trước đoạn không liên quan', async () => {
    const hit = await seedChunk(wsA, srcA, verA, 'q-hit', 'Áo len cổ tròn giặt tay dưới 30 độ');
    await seedChunk(wsA, srcA, verA, 'q-miss', 'Quần short kaki giao hàng nhanh');
    const hits = await search(wsA, verA, 'ao len gat tay');
    expect(hits[0]?.id).toBe(hit);
    expect(hits.map((h) => h.content)).not.toContain('Quần short kaki giao hàng nhanh');
  });

  it('lỗi gõ vẫn ra nhờ pg_trgm', async () => {
    const hit = await seedChunk(wsA, srcA, verA, 'q-typo', 'Chính sách bảo hành sandal cao su');
    const hits = await search(wsA, verA, 'sandl');
    expect(hits.map((h) => h.id)).toContain(hit);
  });

  it('nhánh vector: đoạn gần vector truy vấn lên đầu dù không trùng chữ', async () => {
    const near = await seedChunk(wsA, srcA, verA, 'q-vec-near', 'noi dung xyzzy', {
      embedding: unit(7),
    });
    await seedChunk(wsA, srcA, verA, 'q-vec-far', 'noi dung plugh', { embedding: unit(9) });
    const hits = await search(wsA, verA, 'qwerty', { queryVector: unit(7) });
    expect(hits[0]?.id).toBe(near);
  });

  it('một đoạn có mặt ở nhiều nhánh được điểm cao hơn đoạn chỉ ở một nhánh', async () => {
    const both = await seedChunk(wsA, srcA, verA, 'q-both', 'đồng phục thể thao', {
      embedding: unit(21),
    });
    const textOnly = await seedChunk(wsA, srcA, verA, 'q-text', 'đồng phục học sinh');
    const hits = await search(wsA, verA, 'dong phuc', { queryVector: unit(21) });
    const rank = (id: string) => hits.findIndex((h) => h.id === id);
    expect(rank(both)).toBeGreaterThanOrEqual(0);
    expect(rank(both)).toBeLessThan(rank(textOnly));
  });

  it('chéo workspace: B không thấy đoạn của A; truy vấn phiên bản của A từ B rỗng', async () => {
    await seedChunk(wsA, srcA, verA, 'x-a', 'tuyetmat ghichu rieng cua A');
    await seedChunk(wsB, srcB, verB, 'x-b', 'tuyetmat ghichu rieng cua B');
    const fromB = await search(wsB, verB, 'tuyetmat');
    expect(fromB.map((h) => h.content)).toEqual(['tuyetmat ghichu rieng cua B']);
    expect(await search(wsB, verA, 'tuyetmat')).toEqual([]);
  });

  it('chỉ lấy đúng phiên bản (đoạn nháp không có version_id bị bỏ)', async () => {
    await seedChunk(wsA, srcA, null, 'v-draft', 'banhnhap duynhat');
    expect(await search(wsA, verA, 'banhnhap')).toEqual([]);
  });

  it('hiệu lực: hết hạn và chưa tới hạn bị bỏ, đang hiệu lực được giữ', async () => {
    await seedChunk(wsA, srcA, verA, 'd-old', 'khuyenmai cu', {
      validUntil: '2000-01-01T00:00:00Z',
    });
    await seedChunk(wsA, srcA, verA, 'd-future', 'khuyenmai tuonglai', {
      validFrom: '2999-01-01T00:00:00Z',
    });
    const now = await seedChunk(wsA, srcA, verA, 'd-now', 'khuyenmai hientai', {
      validFrom: '2000-01-01T00:00:00Z',
      validUntil: '2999-01-01T00:00:00Z',
    });
    const hits = await search(wsA, verA, 'khuyenmai');
    expect(hits.map((h) => h.id)).toEqual([now]);
  });

  it('ngôn ngữ: vi không lấy đoạn en và ngược lại', async () => {
    const en = await seedChunk(wsA, srcA, verA, 'l-en', 'refundpolicy within seven days', {
      lang: 'en',
    });
    await seedChunk(wsA, srcA, verA, 'l-vi', 'refundpolicy trong bảy ngày', { lang: 'vi' });
    const hitsEn = await search(wsA, verA, 'refundpolicy', { lang: 'en' });
    expect(hitsEn.map((h) => h.id)).toEqual([en]);
    const hitsVi = await search(wsA, verA, 'refundpolicy', { lang: 'vi' });
    expect(hitsVi.map((h) => h.content)).toEqual(['refundpolicy trong bảy ngày']);
  });

  it('sản phẩm: đoạn của sản phẩm khác bị bỏ, đoạn chung (product_id NULL) giữ', async () => {
    const p1 = (await seedProduct(wsA, 'SP một')) as string;
    const p2 = (await seedProduct(wsA, 'SP hai')) as string;
    const mine = await seedChunk(wsA, srcA, verA, 'p-mine', 'chatlieu vaisoi', { productId: p1 });
    const other = await seedChunk(wsA, srcA, verA, 'p-other', 'chatlieu vaitoc', {
      productId: p2,
    });
    const shared = await seedChunk(wsA, srcA, verA, 'p-shared', 'chatlieu chung');
    const ids = (await search(wsA, verA, 'chatlieu', { productIds: [p1] })).map((h) => h.id);
    expect(ids).toContain(mine);
    expect(ids).toContain(shared);
    expect(ids).not.toContain(other);
    const all = (await search(wsA, verA, 'chatlieu')).map((h) => h.id);
    expect(all).toContain(other);
    const empty = (await search(wsA, verA, 'chatlieu', { productIds: [] })).map((h) => h.id);
    expect(empty).toContain(other); // [] = bài chưa gắn sản phẩm → không lọc
  });

  it('en: searchKbChunks dùng stemming ("shirts" khớp "shirt")', async () => {
    const en = await seedChunk(wsA, srcA, verA, 'en-stem', 'Linen shirt sizing', { lang: 'en' });
    const hits = await search(wsA, verA, 'linen shirts', { lang: 'en' });
    expect(hits.map((h) => h.id)).toContain(en);
  });

  it('trigger chạy dưới đường hệ thống (withJob/cf_worker): INSERT và UPDATE content', async () => {
    const id = newId();
    await db.withJob(wsA, async (tx) => {
      await tx.execute(sql`INSERT INTO cf.kb_chunks
        (id, workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
        VALUES (${id}::uuid, ${wsA}::uuid, ${srcA}::uuid, ${verA}::uuid, 'job-1', 'Đổi trả hàng', 'vi', 'h-job', false)`);
      await tx.execute(
        sql`UPDATE cf.kb_chunks SET content = 'Bảo hành hai năm' WHERE id = ${id}::uuid`,
      );
    });
    const hits = await search(wsA, verA, 'bao hanh hai nam');
    expect(hits.map((h) => h.id)).toContain(id);
  });

  it('đoạn nghi cài lệnh (injection_suspected) không được trả', async () => {
    await seedChunk(wsA, srcA, verA, 'inj', 'canhbao nghingo', { injection: true });
    expect(await search(wsA, verA, 'canhbao')).toEqual([]);
  });

  it('limit; truy vấn rỗng → rỗng; chỉ stopword/dấu câu không lỗi', async () => {
    for (let i = 0; i < 4; i += 1)
      await seedChunk(wsA, srcA, verA, `lim-${i}`, `giaohang nhanh ${i}`);
    expect(await search(wsA, verA, 'giaohang', { limit: 2 })).toHaveLength(2);
    expect(await search(wsA, verA, '   ')).toEqual([]);
    expect(await search(wsA, verA, '?!', { lang: 'en' })).toEqual([]);
  });
});

describe('FR-127 searchProducts / findProductMatch', () => {
  it('"ao len xah" (gõ sai, không dấu) ra đúng sản phẩm; archived và chéo workspace bị bỏ', async () => {
    const target = await seedProduct(wsA, 'Áo len xanh');
    await seedProduct(wsA, 'Quần short kaki');
    await seedProduct(wsA, 'Áo len xanh lưu trữ', { status: 'archived' });
    await seedProduct(wsB, 'Áo len xanh của B');
    const hits = await db.withWorkspace(wsA, (tx) =>
      searchProducts(tx, { workspaceId: wsA, queryText: 'ao len xah' }),
    );
    expect(hits[0]?.id).toBe(target);
    expect(hits.map((h) => h.name)).not.toContain('Áo len xanh lưu trữ');
    expect(hits.map((h) => h.name)).not.toContain('Áo len xanh của B');
    const match = await db.withWorkspace(wsA, (tx) =>
      findProductMatch(tx, { workspaceId: wsA, queryText: 'ao len xah' }),
    );
    expect(match).toMatchObject({ status: 'matched', id: target });
  });

  it('tên Shopify dài, khách gõ tên ngắn/diễn đạt khác → vẫn nhận đúng sản phẩm (word_similarity), không nhận sản phẩm lạ', async () => {
    const bird = await seedProduct(
      wsA,
      'Electric Bird Food Shell Blowing Machine, Efficient Quiet Operation Bird Food Separator, Detachable Easy Cleaning',
    );
    const cart = await seedProduct(
      wsA,
      'Lightweight Foldable Shopping Cart, 75Lbs Capacity, Removable Bag, Premium Wheels, Sage',
    );
    await seedProduct(
      wsA,
      'Cartoon Children Electric Toothbrush with USB Power, Push Button Control',
    );
    const find = (queryText: string) =>
      db.withWorkspace(wsA, (tx) => findProductMatch(tx, { workspaceId: wsA, queryText }));
    expect(await find('Bird Food Shell Blower')).toMatchObject({ status: 'matched', id: bird });
    expect(await find('bird food shell blowing machine')).toMatchObject({
      status: 'matched',
      id: bird,
    });
    expect(await find('Foldable Shopping Cart')).toMatchObject({ status: 'matched', id: cart });
    expect(await find('shopping cart')).toMatchObject({ status: 'matched', id: cart });
    // Không nhận bừa: câu không liên quan tới sản phẩm nào.
    expect((await find('wireless gaming keyboard')).status).toBe('none');
  });

  it('truy vấn lạ → không chọn (để AI hỏi lại)', async () => {
    const match = await db.withWorkspace(wsA, (tx) =>
      findProductMatch(tx, { workspaceId: wsA, queryText: 'zzzz qqqq' }),
    );
    expect(match.status).toBe('none');
  });

  it('nhánh vector: sản phẩm gần vector truy vấn có mặt dù chữ không giống', async () => {
    const p = await seedProduct(wsA, 'Mẫu vec riêng', { embedding: unit(33) });
    const hits = await db.withWorkspace(wsA, (tx) =>
      searchProducts(tx, {
        workspaceId: wsA,
        queryText: 'khongtrung',
        queryVector: unit(33),
        embeddingModel: 'bge-m3',
      }),
    );
    expect(hits.map((h) => h.id)).toContain(p);
  });

  it('KHÔNG trộn model: vector sản phẩm khác model, hoặc truy vấn không nêu model → không có nhánh vector', async () => {
    const p = await seedProduct(wsA, 'Mẫu vec model cũ', {
      embedding: unit(34),
      model: 'cu-model',
    });
    const other = await db.withWorkspace(wsA, (tx) =>
      searchProducts(tx, {
        workspaceId: wsA,
        queryText: 'khongtrung2',
        queryVector: unit(34),
        embeddingModel: 'bge-m3',
      }),
    );
    expect(other.map((h) => h.id)).not.toContain(p);
    const noModel = await db.withWorkspace(wsA, (tx) =>
      searchProducts(tx, { workspaceId: wsA, queryText: 'khongtrung2', queryVector: unit(34) }),
    );
    expect(noModel.map((h) => h.id)).not.toContain(p);
  });

  it('hai sản phẩm gần như nhau → mơ hồ', async () => {
    await seedProduct(wsB, 'Váy hoa nhí đỏ');
    await seedProduct(wsB, 'Váy hoa nhí đỏ');
    const match = await db.withWorkspace(wsB, (tx) =>
      findProductMatch(tx, { workspaceId: wsB, queryText: 'vay hoa nhi do' }),
    );
    expect(match.status).toBe('ambiguous');
  });
});

describe('FR-135 getProductRevs + isProductCacheStale', () => {
  it('đổi giá → rev tăng → cache trượt; đổi tên hoặc embedding → cache còn dùng', async () => {
    const p = await seedProduct(wsA, 'Mũ lưỡi trai', { price: 100000 });
    const cached = await db.withWorkspace(wsA, (tx) => getProductRevs(tx, wsA, [p]));
    expect(cached).toEqual({ [p]: 1 });

    await admin.query("UPDATE cf.products SET name = 'Mũ lưỡi trai mới' WHERE id = $1", [p]);
    await db.withActor(wsA, owner, (tx) => setProductNameEmbedding(tx, wsA, p, unit(5), 'bge-m3'));
    const afterName = await db.withWorkspace(wsA, (tx) => getProductRevs(tx, wsA, [p]));
    expect(isProductCacheStale(cached, afterName)).toBe(false);

    await db.withActor(wsA, owner, async (tx) => {
      await tx.execute(sql`UPDATE cf.products SET price_vnd = 120000 WHERE id = ${p}::uuid`);
    });
    const afterPrice = await db.withWorkspace(wsA, (tx) => getProductRevs(tx, wsA, [p]));
    expect(afterPrice[p]).toBe(2);
    expect(isProductCacheStale(cached, afterPrice)).toBe(true);
  });

  it('getProductRevs: danh sách rỗng → {}; id của workspace khác không lộ', async () => {
    const pB = await seedProduct(wsB, 'Chỉ của B');
    expect(await db.withWorkspace(wsA, (tx) => getProductRevs(tx, wsA, []))).toEqual({});
    expect(await db.withWorkspace(wsA, (tx) => getProductRevs(tx, wsA, [pB, newId()]))).toEqual({});
  });
});

describe('FR-127 setProductNameEmbedding: quyền', () => {
  it('thành viên ghi được; withWorkspace trần không ghi được; id lạ → false', async () => {
    const p = await seedProduct(wsA, 'Dép quai ngang');
    expect(
      await db.withActor(wsA, owner, (tx) =>
        setProductNameEmbedding(tx, wsA, p, unit(1), 'bge-m3'),
      ),
    ).toBe(true);
    expect(
      await db.withActor(wsA, owner, (tx) =>
        setProductNameEmbedding(tx, wsA, newId(), unit(1), 'bge-m3'),
      ),
    ).toBe(false);
    // withWorkspace trần: RLS lọc hết dòng → không ghi được (false), giá trị cũ giữ nguyên.
    expect(
      await db.withWorkspace(wsA, (tx) => setProductNameEmbedding(tx, wsA, p, unit(2), 'bge-m3')),
    ).toBe(false);
    const row = (
      await admin.query('SELECT name_embedding::text AS e FROM cf.products WHERE id = $1', [p])
    ).rows[0];
    expect(row.e.startsWith('[0,1,0')).toBe(true); // unit(1) = [0,1,0…]
    const model = (
      await admin.query('SELECT name_embedding_model AS m FROM cf.products WHERE id = $1', [p])
    ).rows[0].m;
    expect(model).toBe('bge-m3'); // model ghi CÙNG LÚC với vector (chặn lệch model)
  });

  it('chuẩn hóa truy vấn khớp phép lower(unaccent()) của DB', async () => {
    const text = 'Đồng Phục, Áo Dài';
    const dbValue = (await admin.query('SELECT lower(unaccent($1)) AS v', [text])).rows[0].v;
    expect(normalizeSearchText(text)).toBe(dbValue.replace(/[^a-z0-9]+/g, ' ').trim());
  });
});
