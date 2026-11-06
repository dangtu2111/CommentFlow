import { type ChunkDraft, foldText, indexText } from '@flow/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { kbChunks } from '../schema/cf/kb';

/**
 * Ghi/đọc BẢN NHÁP đoạn kiến thức (FR-055, 130, 131). CHỈ chạy được trong `withJob` (worker lập chỉ mục):
 * RLS `kb_chunks_insert/update/delete` đòi `is_system_context()` (migration 0033); vai trò khác bị 42501.
 * Mọi hàm đều lọc theo `workspace_id` + `source_id` và chỉ chạm hàng nháp (`version_id IS NULL AND is_draft`),
 * nên không bao giờ sửa/xóa đoạn đã xuất bản (bất biến theo phiên bản).
 * Việc chuyển nháp → phiên bản mới thuộc việc xuất bản (không ở đây).
 */

export type DraftChunkState = {
  chunkKey: string;
  contentHash: string;
  embeddingModel: string | null;
};

export type DraftChunkWrite = ChunkDraft & {
  contentHash: string;
  embedding: number[];
  embeddingModel: string;
  /** Kết quả quét cài lệnh (FR-164). Thiếu = không nghi ngờ. */
  injectionSuspected?: boolean;
  injectionReason?: string | null;
};

const isDraftOfSource = (workspaceId: string, sourceId: string): SQL =>
  sql`workspace_id = ${workspaceId}::uuid AND source_id = ${sourceId}::uuid
      AND version_id IS NULL AND is_draft`;

/**
 * Văn bản cho `tsv` (docs/10 §3.4): `header + "\n" + content`. Tiếng Việt: cấu hình `simple` trên văn bản
 * đã bỏ dấu bằng `foldText` (DB không phụ thuộc extension `unaccent`; truy vấn tìm kiếm PHẢI `foldText` cùng cách).
 * Tiếng Anh: cấu hình `english` (có stemming).
 */
function tsvExpression(chunk: ChunkDraft): SQL {
  const text = indexText(chunk);
  return chunk.lang === 'vi'
    ? sql`to_tsvector('simple', ${foldText(text)}::text)`
    : sql`to_tsvector('english', ${text}::text)`;
}

const DELETE_BATCH = 1000;

const vectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;

/** Trạng thái đoạn nháp hiện có của một nguồn, để `planChunkIndexing` quyết định đoạn nào cần embed lại. */
export async function listDraftChunkState(
  tx: Database,
  workspaceId: string,
  sourceId: string,
): Promise<DraftChunkState[]> {
  const result = await tx.execute(sql`
    SELECT chunk_key, content_hash, embedding_model FROM cf.kb_chunks
    WHERE ${isDraftOfSource(workspaceId, sourceId)}
    ORDER BY chunk_key`);
  return result.rows.map((row) => ({
    chunkKey: row.chunk_key as string,
    contentHash: row.content_hash as string,
    embeddingModel: (row.embedding_model as string | null) ?? null,
  }));
}

/** Thêm mới hoặc cập nhật đoạn nháp (khóa `(workspace, source, NULL, chunk_key)`); cột cập nhật = cột đã GRANT. */
export async function upsertDraftChunks(
  tx: Database,
  workspaceId: string,
  sourceId: string,
  rows: DraftChunkWrite[],
): Promise<void> {
  for (const row of rows) {
    await tx.execute(sql`
      INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash,
        embedding, tsv, is_draft, context_header, product_id, valid_from, valid_until, embedding_model,
        injection_suspected, injection_reason)
      VALUES (${workspaceId}::uuid, ${sourceId}::uuid, NULL, ${row.chunkKey}, ${row.content}, ${row.lang},
        ${row.contentHash}, ${vectorLiteral(row.embedding)}::halfvec, ${tsvExpression(row)}, true,
        ${row.contextHeader}, ${row.productId}::uuid, ${row.validFrom}, ${row.validUntil}, ${row.embeddingModel},
        ${row.injectionSuspected ?? false}, ${row.injectionReason ?? null})
      ON CONFLICT ON CONSTRAINT kb_chunks_key_unique DO UPDATE SET
        injection_suspected = CASE WHEN cf.kb_chunks.content_hash IS DISTINCT FROM EXCLUDED.content_hash
          THEN EXCLUDED.injection_suspected ELSE cf.kb_chunks.injection_suspected END,
        injection_reason = CASE WHEN cf.kb_chunks.content_hash IS DISTINCT FROM EXCLUDED.content_hash
          THEN EXCLUDED.injection_reason ELSE cf.kb_chunks.injection_reason END,
        content = EXCLUDED.content, lang = EXCLUDED.lang, content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding, tsv = EXCLUDED.tsv, context_header = EXCLUDED.context_header,
        product_id = EXCLUDED.product_id, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
        embedding_model = EXCLUDED.embedding_model, updated_at = now()`);
  }
}

/**
 * Đoạn không đổi embedding vẫn có thể đổi hạn hiệu lực/sản phẩm (không nằm trong `content_hash`):
 * làm mới đúng ba cột đó, không đụng embedding/tsv.
 */
export async function refreshDraftChunkMeta(
  tx: Database,
  workspaceId: string,
  sourceId: string,
  drafts: ChunkDraft[],
): Promise<void> {
  for (const draft of drafts) {
    await tx.execute(sql`
      UPDATE cf.kb_chunks
      SET product_id = ${draft.productId}::uuid, valid_from = ${draft.validFrom},
          valid_until = ${draft.validUntil}, updated_at = now()
      WHERE ${isDraftOfSource(workspaceId, sourceId)} AND chunk_key = ${draft.chunkKey}
        AND (product_id IS DISTINCT FROM ${draft.productId}::uuid
          OR valid_from IS DISTINCT FROM ${draft.validFrom}
          OR valid_until IS DISTINCT FROM ${draft.validUntil})`);
  }
}

/** Xóa đoạn nháp không còn trong bản cắt mới; trả số hàng xóa. Rỗng → không làm gì. */
export async function deleteDraftChunks(
  tx: Database,
  workspaceId: string,
  sourceId: string,
  chunkKeys: string[],
): Promise<number> {
  let deleted = 0;
  // Chia lô: Postgres giới hạn 65.535 tham số mỗi câu lệnh.
  for (let start = 0; start < chunkKeys.length; start += DELETE_BATCH) {
    const batch = chunkKeys.slice(start, start + DELETE_BATCH);
    const result = await tx.execute(sql`
      DELETE FROM cf.kb_chunks
      WHERE ${isDraftOfSource(workspaceId, sourceId)}
        AND chunk_key IN (${sql.join(
          batch.map((key) => sql`${key}`),
          sql`, `,
        )})`);
    deleted += result.rowCount ?? 0;
  }
  return deleted;
}

/**
 * Bộ lọc hạn hiệu lực BẮT BUỘC cho truy vấn tìm kiếm (docs/10 §5, FR-131):
 * `valid_from` rỗng hoặc ≤ now, và `valid_until` rỗng hoặc > now. Dùng với `cf.kb_chunks` không bí danh.
 */
export function validChunkFilter(now: Date | null = null): SQL {
  const at = now === null ? sql`now()` : sql`${now}::timestamptz`;
  return sql`(${kbChunks.validFrom} IS NULL OR ${kbChunks.validFrom} <= ${at})
    AND (${kbChunks.validUntil} IS NULL OR ${kbChunks.validUntil} > ${at})`;
}
