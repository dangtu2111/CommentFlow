import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Tạo lại embedding khi đổi mô hình (FR-133). CHỈ chạy trong `withJob` (RLS `kb_chunks_update` đòi ngữ cảnh hệ thống).
 * Chỉ ghi hai cột dẫn xuất `embedding`, `embedding_model` (+ `updated_at`); không đổi `content`, `content_hash`, `tsv`,
 * `version_id`, `is_draft` nên đoạn đã xuất bản vẫn bất biến về nội dung. Mọi hàm lọc `workspace_id`.
 */

export type ReembedChunk = {
  id: string;
  contentHash: string;
  lang: 'vi' | 'en';
  contextHeader: string | null;
  content: string;
};

export type ReembedWrite = { id: string; contentHash: string; embedding: number[] };

const vectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;

/** Đoạn chưa ở mô hình đích: `embedding_model` khác hoặc NULL (dùng chỉ mục `(workspace_id, embedding_model)`, 0042). */
const needsReembed = (workspaceId: string, model: string) =>
  sql`workspace_id = ${workspaceId}::uuid AND embedding_model IS DISTINCT FROM ${model}`;

export async function countChunksToReembed(
  tx: Database,
  workspaceId: string,
  model: string,
): Promise<number> {
  const result = await tx.execute(
    sql`SELECT count(*)::int AS n FROM cf.kb_chunks WHERE ${needsReembed(workspaceId, model)}`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Một lô đoạn cần tạo lại (id tăng dần). Đoạn đã ghi xong rời khỏi điều kiện nên lần gọi sau tự sang lô kế. */
export async function listChunksToReembed(
  tx: Database,
  workspaceId: string,
  model: string,
  limit: number,
): Promise<ReembedChunk[]> {
  const result = await tx.execute(sql`
    SELECT id, content_hash, lang, context_header, content FROM cf.kb_chunks
    WHERE ${needsReembed(workspaceId, model)}
    ORDER BY id LIMIT ${limit}`);
  return result.rows.map((row) => ({
    id: row.id as string,
    contentHash: row.content_hash as string,
    lang: row.lang as 'vi' | 'en',
    contextHeader: (row.context_header as string | null) ?? null,
    content: row.content as string,
  }));
}

/**
 * Ghi vector mới. Chỉ ghi khi `content_hash` còn khớp lúc đọc (đoạn nháp đổi nội dung giữa chừng sẽ được lập chỉ mục
 * lại bởi luồng thường, không bị ghi đè bằng vector cũ). Trả số hàng đã ghi.
 */
export async function writeReembeddedChunks(
  tx: Database,
  workspaceId: string,
  model: string,
  rows: ReembedWrite[],
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    if (row.embedding.length !== 1024 || !row.embedding.every(Number.isFinite)) {
      throw new Error('Vector embedding không hợp lệ (cần 1024 số hữu hạn).');
    }
    const result = await tx.execute(sql`
      UPDATE cf.kb_chunks
      SET embedding = ${vectorLiteral(row.embedding)}::halfvec, embedding_model = ${model}, updated_at = now()
      WHERE workspace_id = ${workspaceId}::uuid AND id = ${row.id}::uuid AND content_hash = ${row.contentHash}
        AND embedding_model IS DISTINCT FROM ${model}`);
    written += result.rowCount ?? 0;
  }
  return written;
}
