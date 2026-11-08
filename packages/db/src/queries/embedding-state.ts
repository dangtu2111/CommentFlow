import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Model embedding đang hoạt động (FR-133, EMBED-ACTIVE-MODEL, 0079): `cf.embedding_state` là nguồn DUY NHẤT; web/worker/EVAL đọc tên model ở đây
 * (env chỉ bật/tắt dịch vụ ml). Đổi model chỉ qua `kb:switch-embedding` (hàm DEFINER, đủ 100% mới đổi, một giao dịch).
 */
export type EmbeddingState = {
  /** `null` = chưa kích hoạt model nào → không có nhánh vector. */
  activeModel: string | null;
  pendingModel: string | null;
  revision: number;
};

export async function getEmbeddingState(tx: Database): Promise<EmbeddingState> {
  const result = await tx.execute(
    sql`SELECT active_model, pending_model, revision::int AS revision FROM cf.embedding_state`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('cf.embedding_state thiếu dòng cấu hình (migration 0079).');
  return {
    activeModel: (row.active_model as string | null) ?? null,
    pendingModel: (row.pending_model as string | null) ?? null,
    revision: Number(row.revision),
  };
}

// ---- Đổi model (chỉ worker, ngữ cảnh hệ thống trần: `db.withSystem`) ----

export async function beginEmbeddingSwitch(tx: Database, model: string): Promise<void> {
  await tx.execute(sql`SELECT cf.begin_embedding_switch(${model})`);
}

export type SwitchPendingWorkspace = { workspaceId: string; chunks: number; products: number };

export async function listEmbeddingSwitchPending(
  tx: Database,
  model: string,
  limit: number,
): Promise<SwitchPendingWorkspace[]> {
  const result = await tx.execute(
    sql`SELECT workspace_id, chunks, products FROM cf.list_embedding_switch_pending(${model}, ${limit})`,
  );
  return result.rows.map((r) => ({
    workspaceId: r.workspace_id as string,
    chunks: Number(r.chunks),
    products: Number(r.products),
  }));
}

/** Đổi model hoạt động: ném lỗi (và hủy toàn bộ) nếu còn dòng chưa có vector đệm đúng model hoặc `expectedRevision` lệch. Trả revision mới. */
export async function switchActiveEmbedding(
  tx: Database,
  model: string,
  expectedRevision: number,
): Promise<number> {
  const result = await tx.execute(
    sql`SELECT cf.switch_active_embedding(${model}, ${expectedRevision}::bigint) AS revision`,
  );
  return Number(result.rows[0]?.revision);
}

// ---- Ghi vector ĐỆM của một workspace (trong `withJob`); trigger DB đòi model = pending_model ----

const vectorLiteral = (embedding: readonly number[]): string => `[${embedding.join(',')}]`;
const assertVector = (embedding: readonly number[]): void => {
  if (embedding.length !== 1024 || !embedding.every(Number.isFinite)) {
    throw new Error('Vector embedding không hợp lệ (cần 1024 số hữu hạn).');
  }
};

export type SwitchChunk = {
  id: string;
  contentHash: string;
  lang: 'vi' | 'en';
  contextHeader: string | null;
  content: string;
};

/** MỌI đoạn của workspace (nháp lẫn đã xuất bản) chưa có vector đệm đúng model. */
export async function listChunksForSwitch(
  tx: Database,
  workspaceId: string,
  model: string,
  limit: number,
): Promise<SwitchChunk[]> {
  const result = await tx.execute(sql`
    SELECT id, content_hash, lang, context_header, content FROM cf.kb_chunks
    WHERE workspace_id = ${workspaceId}::uuid AND (embedding_next IS NULL OR embedding_next_model IS DISTINCT FROM ${model})
    ORDER BY id LIMIT ${limit}`);
  return result.rows.map((row) => ({
    id: row.id as string,
    contentHash: row.content_hash as string,
    lang: row.lang as 'vi' | 'en',
    contextHeader: (row.context_header as string | null) ?? null,
    content: row.content as string,
  }));
}

/** Chỉ ghi khi `content_hash` còn khớp lúc đọc (đoạn nháp đổi nội dung giữa chừng sẽ được lấy lại ở lượt sau). Trả số hàng ghi. */
export async function writeChunksNext(
  tx: Database,
  workspaceId: string,
  model: string,
  rows: Array<{ id: string; contentHash: string; embedding: number[] }>,
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    assertVector(row.embedding);
    const result = await tx.execute(sql`
      UPDATE cf.kb_chunks
      SET embedding_next = ${vectorLiteral(row.embedding)}::halfvec, embedding_next_model = ${model}
      WHERE workspace_id = ${workspaceId}::uuid AND id = ${row.id}::uuid AND content_hash = ${row.contentHash}`);
    written += result.rowCount ?? 0;
  }
  return written;
}

export type SwitchProduct = { id: string; name: string };

export async function listProductsForSwitch(
  tx: Database,
  workspaceId: string,
  model: string,
  limit: number,
): Promise<SwitchProduct[]> {
  const result = await tx.execute(sql`
    SELECT id, name FROM cf.products
    WHERE workspace_id = ${workspaceId}::uuid
      AND (name_embedding_next IS NULL OR name_embedding_next_model IS DISTINCT FROM ${model})
    ORDER BY id LIMIT ${limit}`);
  return result.rows.map((row) => ({ id: row.id as string, name: row.name as string }));
}

/** Chỉ ghi khi tên còn như lúc đọc. Trả số hàng ghi. */
export async function writeProductsNext(
  tx: Database,
  workspaceId: string,
  model: string,
  rows: Array<{ id: string; name: string; embedding: number[] }>,
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    assertVector(row.embedding);
    const result = await tx.execute(sql`
      UPDATE cf.products
      SET name_embedding_next = ${vectorLiteral(row.embedding)}::halfvec(1024), name_embedding_next_model = ${model}
      WHERE workspace_id = ${workspaceId}::uuid AND id = ${row.id}::uuid AND name = ${row.name}`);
    written += result.rowCount ?? 0;
  }
  return written;
}
