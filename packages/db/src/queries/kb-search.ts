import {
  ALIAS_MATCH_THRESHOLD,
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
  /** Điểm RRF (chỉ để so thứ tự, không phải độ liên quan 0–1). */
  score: number;
};

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
  const normalized = normalizeSearchText(input.queryText);
  const tsQuery = orTsQuery(normalized);
  if (normalized === '' && !input.queryVector) return [];
  const limit = input.limit ?? DEFAULT_KB_SEARCH_LIMIT;
  const config = input.lang === 'en' ? sql`'english'::regconfig` : sql`'simple'::regconfig`;
  const productFilter =
    input.productIds && input.productIds.length > 0
      ? sql`AND (c.product_id IS NULL OR c.product_id IN (${uuidList(input.productIds)}))`
      : sql``; // bài chưa gắn sản phẩm ([] hoặc bỏ trống) → không lọc theo sản phẩm (docs/10 §5)
  const filters = sql`
    c.workspace_id = ${input.workspaceId}::uuid
    AND c.version_id = ${input.versionId}::uuid
    AND NOT c.is_draft
    AND c.lang = ${input.lang}
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
      SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024), c.id) AS r
        FROM cf.kb_chunks c
       WHERE ${filters} AND c.embedding IS NOT NULL ${modelFilter}
       ORDER BY c.embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024)
       LIMIT ${BRANCH_LIMIT}`
    : sql`SELECT NULL::uuid AS id, NULL::bigint AS r WHERE false`;
  const textBranch =
    tsQuery === ''
      ? sql`SELECT NULL::uuid AS id, NULL::bigint AS r WHERE false`
      : sql`
      SELECT c.id, row_number() OVER (ORDER BY ts_rank(c.tsv, q.query) DESC, c.id) AS r
        FROM cf.kb_chunks c, to_tsquery(${config}, ${tsQuery}) AS q(query)
       WHERE ${filters} AND c.tsv @@ q.query
       ORDER BY ts_rank(c.tsv, q.query) DESC, c.id
       LIMIT ${BRANCH_LIMIT}`;
  const trigramBranch =
    normalized === ''
      ? sql`SELECT NULL::uuid AS id, NULL::bigint AS r WHERE false`
      : sql`
      SELECT c.id, row_number() OVER (ORDER BY word_similarity(${normalized}, c.search_norm) DESC, c.id) AS r
        FROM cf.kb_chunks c
       WHERE ${filters} AND ${normalized} <% c.search_norm
       ORDER BY word_similarity(${normalized}, c.search_norm) DESC, c.id
       LIMIT ${BRANCH_LIMIT}`;

  const result = await tx.execute<{
    id: string;
    chunk_key: string;
    content: string;
    context_header: string | null;
    product_id: string | null;
    score: string;
  }>(sql`
    WITH v AS (${vectorBranch}), t AS (${textBranch}), g AS (${trigramBranch}),
    fused AS (
      SELECT id, sum(1.0 / (60 + r)) AS score
        FROM (SELECT * FROM v UNION ALL SELECT * FROM t UNION ALL SELECT * FROM g) x
       GROUP BY id
    )
    SELECT c.id, c.chunk_key, c.content, c.context_header, c.product_id, f.score
      FROM fused f
      JOIN cf.kb_chunks c ON c.id = f.id AND c.workspace_id = ${input.workspaceId}::uuid
     ORDER BY f.score DESC, c.id
     LIMIT ${limit}`);
  return result.rows.map((row) => ({
    id: row.id,
    chunkKey: row.chunk_key,
    content: row.content,
    contextHeader: row.context_header,
    productId: row.product_id,
    score: Number(row.score),
  }));
}

export type ProductSearchQuery = {
  workspaceId: string;
  queryText: string;
  queryVector?: readonly number[];
  limit?: number;
};

export type ProductHit = {
  id: string;
  name: string;
  /** Độ giống trigram 0–1 giữa `search_text` và câu hỏi (0 nếu chỉ ra từ nhánh vector). */
  similarity: number;
  /** Điểm RRF của hai nhánh (để xếp thứ tự). */
  score: number;
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
  const trigram =
    normalized === ''
      ? []
      : (
          await tx.execute<{ id: string; name: string; s: number }>(sql`
            SELECT p.id, p.name, similarity(p.search_text, ${normalized}) AS s
              FROM cf.products p
             WHERE p.workspace_id = ${input.workspaceId}::uuid AND p.status = 'active'
               AND p.search_text % ${normalized}
             ORDER BY s DESC, p.id
             LIMIT ${limit}`)
        ).rows;
  const semantic = input.queryVector
    ? (
        await tx.execute<{ id: string; name: string }>(sql`
          SELECT p.id, p.name
            FROM cf.products p
           WHERE p.workspace_id = ${input.workspaceId}::uuid AND p.status = 'active'
             AND p.name_embedding IS NOT NULL
           ORDER BY p.name_embedding <=> ${vectorLiteral(input.queryVector)}::halfvec(1024), p.id
           LIMIT ${limit}`)
      ).rows
    : [];
  const similarityOf = new Map(trigram.map((row) => [row.id, Number(row.s)]));
  const nameOf = new Map([...trigram, ...semantic].map((row) => [row.id, row.name]));
  return reciprocalRankFusion([trigram.map((r) => r.id), semantic.map((r) => r.id)])
    .slice(0, limit)
    .map(({ id, score }) => ({
      id,
      name: nameOf.get(id) ?? '',
      similarity: similarityOf.get(id) ?? 0,
      score,
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
  return pickProductMatch(hits.map((hit) => ({ id: hit.id, score: hit.similarity })));
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
): Promise<boolean> {
  const result = await tx.execute(sql`
    UPDATE cf.products SET name_embedding = ${vectorLiteral(embedding)}::halfvec(1024)
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${productId}::uuid
    RETURNING id`);
  return result.rows.length > 0;
}
