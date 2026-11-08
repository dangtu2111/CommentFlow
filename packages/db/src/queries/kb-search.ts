import {
  ALIAS_MATCH_THRESHOLD,
  hybridProductScores,
  normalizeSearchText,
  type ProductMatch,
  pickProductMatch,
  reciprocalRankFusion,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { searchProductsByAlias } from './product-aliases';

/**
 * Tìm kiếm (KB-SEARCH-FTS, docs/10 §5): MỌI truy vấn lọc `workspace_id`; gọi trong `withWorkspace`/`withActor`/`withJob`
 * (RLS vẫn áp dụng). Vector truy vấn do tầng trên dựng (qua `Embedder` ở `@flow/ai`), db không gọi mô hình.
 */

/** Số ứng viên mỗi nhánh trước khi trộn (docs/10 §5: limit 30). */
const BRANCH_LIMIT = 30;
export const DEFAULT_KB_SEARCH_LIMIT = 20;
/** Ưu tiên NHẸ đoạn cùng ngôn ngữ câu hỏi (cỡ MỘT bậc RRF: 1/61 − 1/62 ≈ 0,00026); KHÔNG lọc bỏ đoạn khác ngôn ngữ (FR-120). */
const SAME_LANG_BOOST = 0.0003;
/** Ngưỡng `pg_trgm` khởi điểm (docs/10 §5.1; hiệu chuẩn bằng bộ đánh giá). */
const SIMILARITY_THRESHOLD = 0.3;
const WORD_SIMILARITY_THRESHOLD = 0.4;

export type KbSearchLang = 'vi' | 'en';

export type KbSearchInput = {
  workspaceId: string;
  versionId: string;
  lang: KbSearchLang;
  queryText: string;
  /** Vector truy vấn 1024 chiều (halfvec); bỏ qua → chỉ toàn văn + trigram. */
  queryVector?: readonly number[];
  /**
   * Mô hình đã tạo `queryVector` (= `Embedder.model`). Có → nhánh vector chỉ so với đoạn cùng mô hình
   * (vector khác mô hình không so được; FR-133, lúc đang tạo lại embedding). Toàn văn/trigram không bị ảnh hưởng.
   */
  embeddingModel?: string;
  /** Bài đã gắn sản phẩm: đoạn của sản phẩm khác bị bỏ; đoạn chung (`product_id` NULL) giữ. */
  productIds?: readonly string[];
  limit?: number;
};

export type KbSearchHit = {
  id: string;
  chunkKey: string;
  content: string;
  contextHeader: string | null;
  productId: string | null;
  /** `kb_chunks.metadata`: chủ đề `topic`, cờ mâu thuẫn `conflict_group`/`conflict_values` (ghi lúc xuất bản). */
  metadata: Record<string, unknown>;
  /** Điểm RRF (chỉ để so thứ tự, không phải độ liên quan 0–1). */
  score: number;
  /** Cosine tuyệt đối câu hỏi ↔ đoạn (cùng model embedding); `null` khi tìm không có vector. Dùng để quyết định "đủ liên quan". */
  cosine: number | null;
};

/** Hạng + điểm thô của MỖI nhánh (chẩn đoán truy hồi, Nhóm R); `null` = đoạn không nằm trong top của nhánh đó. */
export type KbBranchDetail = {
  vector: { rank: number; distance: number } | null;
  text: { rank: number; tsRank: number } | null;
  trigram: { rank: number; wordSimilarity: number } | null;
};

export type KbSearchHitDetailed = KbSearchHit & { branches: KbBranchDetail };

const vectorLiteral = (vector: readonly number[]) => `[${vector.join(',')}]`;
const uuidList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/** `a | b | c` từ các từ đã chuẩn hóa (chỉ chữ-số nên an toàn cho `to_tsquery`); rỗng → ''. */
const orTsQuery = (normalized: string) => normalized.split(' ').filter(Boolean).join(' | ');

/**
 * Tìm đoạn kiến thức (FR-057): trộn RRF (k=60) ba nhánh — vector, toàn văn (`simple` đã bỏ dấu cho vi, `english` cho
 * en), `pg_trgm` (lỗi gõ). Lọc bắt buộc: workspace, phiên bản, ngôn ngữ, hiệu lực (FR-131), sản phẩm của bài, và bỏ
 * đoạn nghi cài lệnh (FR-164). Chưa gồm rerank, ngưỡng liên quan, trần token (PIPE-RETRIEVE).
 */
export async function searchKbChunks(tx: Database, input: KbSearchInput): Promise<KbSearchHit[]> {
  const detailed = await searchKbChunksDetailed(tx, input);
  return detailed.map(({ branches: _branches, ...hit }) => hit);
}

/** Như `searchKbChunks` nhưng kèm hạng và điểm thô từng nhánh (vector, toàn văn, trigram) để chẩn đoán đoạn trượt. */
export async function searchKbChunksDetailed(
  tx: Database,
  input: KbSearchInput,
): Promise<KbSearchHitDetailed[]> {
  const normalized = normalizeSearchText(input.queryText);
  const tsQuery = orTsQuery(normalized);
  if (normalized === '' && !input.queryVector) return [];
  const limit = input.limit ?? DEFAULT_KB_SEARCH_LIMIT;
  const productFilter =
    input.productIds && input.productIds.length > 0
      ? sql`AND (c.product_id IS NULL OR c.product_id IN (${uuidList(input.productIds)}))`
      : sql``; // bài chưa gắn sản phẩm ([] hoặc bỏ trống) → không lọc theo sản phẩm (docs/10 §5)
  const filters = sql`
    c.workspace_id = ${input.workspaceId}::uuid
    AND c.version_id = ${input.versionId}::uuid
    AND NOT c.is_draft
    AND NOT c.injection_suspected
    AND (c.valid_from IS NULL OR c.valid_from <= now())
    AND (c.valid_until IS NULL OR c.valid_until > now())
    ${productFilter}`;

  await tx.execute(
    sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY_THRESHOLD)}, true)`,
  );

  if (input.queryVector) {
    // HNSW (0042) quét gần đúng rồi mới lọc workspace/phiên bản → quét tiếp đến đủ LIMIT, giữ đúng thứ tự (FR-139).
    await tx.execute(sql`SELECT set_config('hnsw.iterative_scan', 'strict_order', true)`);
  }

  const modelFilter = input.embeddingModel
    ? sql`AND c.embedding_model = ${input.embeddingModel}`
    : sql``;
  const vectorBranch = input.queryVector
    ? sql`
      SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024), c.id) AS r,
             (c.embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024))::float8 AS s
        FROM cf.kb_chunks c
       WHERE ${filters} AND c.embedding IS NOT NULL ${modelFilter}
       ORDER BY c.embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024)
       LIMIT ${BRANCH_LIMIT}`
    : sql`SELECT NULL::uuid AS id, NULL::bigint AS r, NULL::float8 AS s WHERE false`;
  const textBranch =
    tsQuery === ''
      ? sql`SELECT NULL::uuid AS id, NULL::bigint AS r, NULL::float8 AS s WHERE false`
      : sql`
      SELECT x.id, row_number() OVER (ORDER BY x.rank DESC, x.id) AS r, x.rank::float8 AS s
        FROM (
          -- Cấu hình tsv THEO TỪNG ĐOẠN (FR-057): en → english (stemming), còn lại → simple đã bỏ dấu. Không lọc bỏ đoạn khác ngôn ngữ câu hỏi.
          SELECT c.id,
                 CASE WHEN c.lang = 'en' THEN ts_rank(c.tsv, qe.query) ELSE ts_rank(c.tsv, qs.query) END AS rank
            FROM cf.kb_chunks c,
                 to_tsquery('simple'::regconfig, ${tsQuery}) AS qs(query),
                 to_tsquery('english'::regconfig, ${tsQuery}) AS qe(query)
           WHERE ${filters}
             AND ((c.lang = 'en' AND c.tsv @@ qe.query) OR (c.lang <> 'en' AND c.tsv @@ qs.query))
        ) x
       ORDER BY x.rank DESC, x.id
       LIMIT ${BRANCH_LIMIT}`;
  const trigramBranch =
    normalized === ''
      ? sql`SELECT NULL::uuid AS id, NULL::bigint AS r, NULL::float8 AS s WHERE false`
      : sql`
      SELECT c.id, row_number() OVER (ORDER BY word_similarity(${normalized}, c.search_norm) DESC, c.id) AS r,
             word_similarity(${normalized}, c.search_norm)::float8 AS s
        FROM cf.kb_chunks c
       WHERE ${filters} AND ${normalized} <% c.search_norm
       ORDER BY word_similarity(${normalized}, c.search_norm) DESC, c.id
       LIMIT ${BRANCH_LIMIT}`;

  // Điểm TUYỆT ĐỐI để quyết định "đủ liên quan" (RRF chỉ để xếp thứ tự): cosine giữa câu hỏi và đoạn cùng model; NULL khi không có vector.
  const cosine = input.queryVector
    ? sql`CASE WHEN c.embedding IS NOT NULL ${modelFilter} THEN (1 - (c.embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024)))::float8 END`
    : sql`NULL::float8`;
  const result = await tx.execute<{
    id: string;
    chunk_key: string;
    content: string;
    context_header: string | null;
    product_id: string | null;
    metadata: Record<string, unknown> | null;
    score: string;
    cosine: number | null;
    vr: string | null;
    vs: number | null;
    tr: string | null;
    ts: number | null;
    gr: string | null;
    gs: number | null;
  }>(sql`
    WITH v AS (${vectorBranch}), t AS (${textBranch}), g AS (${trigramBranch}),
    fused AS (
      SELECT id, sum(1.0 / (60 + r)) AS score,
             max(r) FILTER (WHERE b = 'v') AS vr, max(s) FILTER (WHERE b = 'v') AS vs,
             max(r) FILTER (WHERE b = 't') AS tr, max(s) FILTER (WHERE b = 't') AS ts,
             max(r) FILTER (WHERE b = 'g') AS gr, max(s) FILTER (WHERE b = 'g') AS gs
        FROM (SELECT id, r, s, 'v' AS b FROM v UNION ALL SELECT id, r, s, 't' FROM t
              UNION ALL SELECT id, r, s, 'g' FROM g) x
       GROUP BY id
    )
    SELECT c.id, c.chunk_key, c.content, c.context_header, c.product_id, c.metadata, f.score,
           ${cosine} AS cosine, f.vr, f.vs, f.tr, f.ts, f.gr, f.gs
      FROM fused f
      JOIN cf.kb_chunks c ON c.id = f.id AND c.workspace_id = ${input.workspaceId}::uuid
     ORDER BY f.score + (CASE WHEN c.lang = ${input.lang} THEN ${SAME_LANG_BOOST}::float8 ELSE 0::float8 END) DESC, c.id
     LIMIT ${limit}`);
  return result.rows.map((row) => ({
    id: row.id,
    chunkKey: row.chunk_key,
    content: row.content,
    contextHeader: row.context_header,
    productId: row.product_id,
    metadata: row.metadata ?? {},
    score: Number(row.score),
    cosine: row.cosine === null ? null : Number(row.cosine),
    branches: {
      vector: row.vr === null ? null : { rank: Number(row.vr), distance: Number(row.vs) },
      text: row.tr === null ? null : { rank: Number(row.tr), tsRank: Number(row.ts) },
      trigram: row.gr === null ? null : { rank: Number(row.gr), wordSimilarity: Number(row.gs) },
    },
  }));
}

export type ProductSearchQuery = {
  workspaceId: string;
  queryText: string;
  queryVector?: readonly number[];
  /** Model đã tạo `queryVector`. THIẾU → bỏ nhánh vector (không bao giờ so vector không rõ model). */
  embeddingModel?: string;
  limit?: number;
};

export type ProductHit = {
  id: string;
  name: string;
  /** Độ giống trigram 0–1 giữa `search_text` và câu hỏi (0 nếu chỉ ra từ nhánh vector). */
  similarity: number;
  /** Điểm RRF của hai nhánh (để xếp thứ tự). */
  score: number;
  /** Cosine giữa vector câu hỏi và `name_embedding` (null nếu không có nhánh vector hoặc sản phẩm chưa có vector cùng model). */
  cosine: number | null;
};

/**
 * Tìm sản phẩm gần đúng (FR-127, docs/10 §5.1 bước 3–4): trigram trên `search_text` (chịu gõ sai/không dấu) + vector
 * `name_embedding`, trộn RRF. Chỉ sản phẩm `active` của workspace. Bước bí danh chưa làm (chưa có bảng).
 */
export async function searchProducts(
  tx: Database,
  input: ProductSearchQuery,
): Promise<ProductHit[]> {
  const normalized = normalizeSearchText(input.queryText);
  if (normalized === '' && !input.queryVector) return [];
  const limit = input.limit ?? 10;
  await tx.execute(
    sql`SELECT set_config('pg_trgm.similarity_threshold', ${String(SIMILARITY_THRESHOLD)}, true)`,
  );
  await tx.execute(
    sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY_THRESHOLD)}, true)`,
  );
  // Điểm = lớn hơn của (a) độ giống CẢ CHUỖI (chịu gõ sai) và (b) `word_similarity` — tên khách gõ nằm trong `search_text` bao
  // nhiêu. (b) cần vì tên sản phẩm từ nguồn ngoài (Shopify) rất dài: khách gõ "bird food shell blower" thì cả chuỗi chỉ ~0,16
  // nhưng gần như nằm trọn trong tên (~0,86). Ngưỡng chọn/mơ hồ ở `pickProductMatch` vẫn áp dụng trên điểm này.
  const trigram =
    normalized === ''
      ? []
      : (
          await tx.execute<{ id: string; name: string; s: number }>(sql`
            SELECT p.id, p.name,
                   GREATEST(similarity(p.search_text, ${normalized}), word_similarity(${normalized}, p.search_text)) AS s
              FROM cf.products p
             WHERE p.workspace_id = ${input.workspaceId}::uuid AND p.status = 'active'
               AND (p.search_text % ${normalized} OR ${normalized} <% p.search_text)
             ORDER BY s DESC, p.id
             LIMIT ${limit}`)
        ).rows;
  const semantic =
    input.queryVector && input.embeddingModel
      ? (
          await tx.execute<{ id: string; name: string; cosine: number }>(sql`
          SELECT p.id, p.name, (1 - (p.name_embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024)))::float8 AS cosine
            FROM cf.products p
           WHERE p.workspace_id = ${input.workspaceId}::uuid AND p.status = 'active'
             AND p.name_embedding IS NOT NULL
             AND p.name_embedding_model = ${input.embeddingModel}
           ORDER BY p.name_embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024), p.id
           LIMIT ${limit}`)
        ).rows
      : [];
  const similarityOf = new Map(trigram.map((row) => [row.id, Number(row.s)]));
  const cosineOf = new Map(semantic.map((row) => [row.id, Number(row.cosine)]));
  const nameOf = new Map([...trigram, ...semantic].map((row) => [row.id, row.name]));
  return reciprocalRankFusion([trigram.map((r) => r.id), semantic.map((r) => r.id)])
    .slice(0, limit)
    .map(({ id, score }) => ({
      id,
      name: nameOf.get(id) ?? '',
      similarity: similarityOf.get(id) ?? 0,
      score,
      cosine: cosineOf.get(id) ?? null,
    }));
}

/**
 * Chọn sản phẩm cho câu hỏi (FR-127/128): dưới ngưỡng → không chọn; hai ứng viên sát nhau → mơ hồ. Điểm quyết định là
 * độ giống trigram (thang 0–1 đã biết), không phải điểm RRF.
 */
export async function findProductMatch(
  tx: Database,
  input: ProductSearchQuery,
): Promise<ProductMatch> {
  const aliasHits = await searchProductsByAlias(tx, input);
  const byAlias = pickProductMatch(
    aliasHits.map((hit) => ({ id: hit.id, score: hit.similarity })),
    { threshold: ALIAS_MATCH_THRESHOLD },
  );
  if (byAlias.status !== 'none') return byAlias;
  const hits = await searchProducts(tx, input);
  // (1b) LAI: điểm mỗi sản phẩm = lớn hơn của trigram và cosine vector tên (khách gõ lệch chữ vẫn khớp) + ưu tiên token đặc trưng (xxxl, a4, 2 in 1, mã);
  // thiếu vector → như cũ (chỉ trigram). Đo 08/11: lai-max hơn lai-RRF (docs/testing/eval-product-match-2026-11-08.md).
  return pickProductMatch(hybridProductScores(hits, { mention: input.queryText }));
}

/**
 * `products.rev` hiện tại của các sản phẩm (FR-135) để so với `product_revs` lưu trong cache
 * (`isProductCacheStale` ở `@flow/shared`). Id không thuộc workspace/không tồn tại → vắng mặt (coi là trượt).
 */
export async function getProductRevs(
  tx: Database,
  workspaceId: string,
  productIds: readonly string[],
): Promise<Record<string, number>> {
  if (productIds.length === 0) return {};
  const result = await tx.execute<{ id: string; rev: string }>(sql`
    SELECT p.id, p.rev FROM cf.products p
     WHERE p.workspace_id = ${workspaceId}::uuid AND p.id IN (${uuidList(productIds)})`);
  return Object.fromEntries(result.rows.map((row) => [row.id, Number(row.rev)]));
}

/**
 * Ghi vector tên sản phẩm (FR-127). KHÔNG tăng `rev` (trigger chỉ đếm giá/tồn/trạng thái/biến thể). Gọi trong
 * `withActor` (thành viên) hoặc `withJob` (đồng bộ). Trả `false` nếu không có sản phẩm đó trong workspace.
 */
export async function setProductNameEmbedding(
  tx: Database,
  workspaceId: string,
  productId: string,
  embedding: readonly number[],
  model: string,
): Promise<boolean> {
  const result = await tx.execute(sql`
    UPDATE cf.products SET name_embedding = ${vectorLiteral(embedding)}::halfvec(1024), name_embedding_model = ${model}
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${productId}::uuid
    RETURNING id`);
  return result.rows.length > 0;
}

/** Ghi vector tên + model; chỉ ghi khi tên còn như lúc đọc. KHÔNG tăng `rev`. Trả số hàng đã ghi. */
export async function writeProductNameVectors(
  tx: Database,
  workspaceId: string,
  model: string,
  rows: Array<{ id: string; name: string; embedding: number[] }>,
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    if (row.embedding.length !== 1024 || row.embedding.some((v) => !Number.isFinite(v))) {
      throw new Error('Vector tên sản phẩm sai kích thước hoặc có giá trị không hợp lệ.');
    }
    const result = await tx.execute(sql`
      UPDATE cf.products
         SET name_embedding = ${vectorLiteral(row.embedding)}::halfvec(1024), name_embedding_model = ${model}
       WHERE workspace_id = ${workspaceId}::uuid AND id = ${row.id}::uuid AND name = ${row.name}`);
    written += result.rowCount ?? 0;
  }
  return written;
}
