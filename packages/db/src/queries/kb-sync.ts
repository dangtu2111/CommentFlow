import { type ProductCard, parseProductCard } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { variantOptionsOf } from './kb-content';

/**
 * Truy vấn cho job `kb-sync` (đồng bộ nguồn nhập tay → bản nháp kiến thức). Chạy trong `withJob` (ngữ cảnh hệ thống của workspace).
 * Mỗi loại đồng bộ có MỘT nguồn `kb_sources` cố định, nhận ra bằng `external_key = 'sync:<loại>'` (không đụng nguồn người dùng tự tạo).
 */
export type SyncSourceKind = 'shop' | 'policy' | 'faq' | 'product';

const SOURCE_TYPE: Record<SyncSourceKind, 'manual' | 'policy' | 'faq'> = {
  shop: 'manual',
  policy: 'policy',
  faq: 'faq',
  product: 'manual',
};

/** Tối đa sản phẩm đưa vào kiến thức mỗi lần (chặn bùng nổ; vượt → job ghi cảnh báo, phần còn lại không vào bản nháp). */
export const KB_SYNC_PRODUCT_LIMIT = 2000;

export async function findOrCreateSyncSource(
  tx: Database,
  workspaceId: string,
  kind: SyncSourceKind,
  title: string,
): Promise<string> {
  const key = `sync:${kind}`;
  const found = await tx.execute<{ id: string }>(sql`
    SELECT id FROM cf.kb_sources
     WHERE workspace_id = ${workspaceId}::uuid AND external_key = ${key} AND deleted_at IS NULL
     ORDER BY created_at LIMIT 1`);
  const existing = found.rows[0]?.id;
  if (existing) {
    await tx.execute(
      sql`UPDATE cf.kb_sources SET title = ${title}, last_synced_at = now(), sync_error = NULL, status = 'active', updated_at = now()
           WHERE workspace_id = ${workspaceId}::uuid AND id = ${existing}::uuid`,
    );
    return existing;
  }
  const created = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.kb_sources (workspace_id, type, title, external_key, status, last_synced_at)
    VALUES (${workspaceId}::uuid, ${SOURCE_TYPE[kind]}, ${title}, ${key}, 'active', now())
    RETURNING id`);
  return created.rows[0]?.id as string;
}

/** Nguồn đồng bộ đã có (không tạo mới); `null` nếu chưa từng đồng bộ loại này. */
export async function findSyncSource(
  tx: Database,
  workspaceId: string,
  kind: SyncSourceKind,
): Promise<string | null> {
  const found = await tx.execute<{ id: string }>(sql`
    SELECT id FROM cf.kb_sources
     WHERE workspace_id = ${workspaceId}::uuid AND external_key = ${`sync:${kind}`} AND deleted_at IS NULL
     ORDER BY created_at LIMIT 1`);
  return found.rows[0]?.id ?? null;
}

/** Sản phẩm đang bán, chỉ cột KHÔNG phải giá/tồn kho (nguyên tắc 4: giá/tồn đọc từ `products`, không từ kiến thức). */
export async function listProductsForSync(
  tx: Database,
  workspaceId: string,
  limit: number = KB_SYNC_PRODUCT_LIMIT,
): Promise<{
  rows: Array<{
    id: string;
    name: string;
    sku: string | null;
    options: ReturnType<typeof variantOptionsOf>;
    card?: ProductCard;
  }>;
  truncated: boolean;
}> {
  const r = await tx.execute<{
    id: string;
    name: string;
    sku: string | null;
    variants: unknown;
    card: unknown;
  }>(sql`
    SELECT id, name, sku, variants, card FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active'
     ORDER BY created_at, id LIMIT ${limit + 1}`);
  const rows = r.rows.slice(0, limit).map((row) => {
    const parsed = parseProductCard(row.card);
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      options: variantOptionsOf(row.variants),
      ...(parsed.ok && Object.keys(parsed.card).length > 0 ? { card: parsed.card } : {}),
    };
  });
  return { rows, truncated: r.rows.length > limit };
}

/**
 * Ghi chủ đề (`metadata.topic`) lên đoạn nháp của một nguồn — MỌI đoạn mỗi lần đồng bộ (đoạn không đổi nội dung không đi qua
 * `upsertDraftChunks`). Chỉ gộp khóa `topic`, giữ khóa khác (vd cờ mâu thuẫn tính lúc xuất bản).
 */
export async function setDraftChunkTopics(
  tx: Database,
  workspaceId: string,
  sourceId: string,
  topics: ReadonlyArray<{ chunkKey: string; topic: string }>,
): Promise<void> {
  for (const { chunkKey, topic } of topics) {
    await tx.execute(sql`
      UPDATE cf.kb_chunks SET metadata = metadata || jsonb_build_object('topic', ${topic}::text)
       WHERE workspace_id = ${workspaceId}::uuid AND source_id = ${sourceId}::uuid
         AND version_id IS NULL AND is_draft AND chunk_key = ${chunkKey}
         AND metadata ->> 'topic' IS DISTINCT FROM ${topic}`);
  }
}

/**
 * Ghi nguồn gốc của đoạn FAQ chắt lọc (`metadata.source_chunk_id`, `metadata.distill_kind`) lên đoạn nháp — để tìm kiếm biết đoạn nào là bản
 * chắt lọc (xếp sau đoạn thô, trần 3/10 chỗ, bỏ khi đoạn thô nguồn đã có trong kết quả). Mọi lần đồng bộ; chỉ gộp khóa của mình.
 */
export async function setDraftChunkDistillMeta(
  tx: Database,
  workspaceId: string,
  sourceId: string,
  marks: ReadonlyArray<{ chunkKey: string; sourceChunkId: string; kind: string }>,
): Promise<void> {
  for (const { chunkKey, sourceChunkId, kind } of marks) {
    await tx.execute(sql`
      UPDATE cf.kb_chunks
         SET metadata = metadata || jsonb_build_object('source_chunk_id', ${sourceChunkId}::text, 'distill_kind', ${kind}::text)
       WHERE workspace_id = ${workspaceId}::uuid AND source_id = ${sourceId}::uuid
         AND version_id IS NULL AND is_draft AND chunk_key = ${chunkKey}
         AND (metadata ->> 'source_chunk_id' IS DISTINCT FROM ${sourceChunkId}::text
              OR metadata ->> 'distill_kind' IS DISTINCT FROM ${kind}::text)`);
  }
}

export type DraftChunkText = {
  chunkKey: string;
  content: string;
  contextHeader: string | null;
  sourceTitle: string;
  topic: string | null;
};

/** Đoạn nháp đủ điều kiện xuất bản (không nghi cài lệnh) kèm nội dung/chủ đề — đầu vào phát hiện mâu thuẫn (chỉ đọc). */
export async function listDraftChunkTexts(
  tx: Database,
  workspaceId: string,
): Promise<DraftChunkText[]> {
  const r = await tx.execute<{
    chunk_key: string;
    content: string;
    context_header: string | null;
    title: string;
    topic: string | null;
  }>(sql`
    SELECT c.chunk_key, c.content, c.context_header, s.title, c.metadata ->> 'topic' AS topic
      FROM cf.kb_chunks c JOIN cf.kb_sources s ON s.id = c.source_id
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.version_id IS NULL AND c.is_draft
       AND NOT c.injection_suspected
     ORDER BY c.chunk_key`);
  return r.rows.map((row) => ({
    chunkKey: row.chunk_key,
    content: row.content,
    contextHeader: row.context_header,
    sourceTitle: row.title,
    topic: row.topic,
  }));
}

export type ConflictMark = { group: string; values: string[]; chunkKeys: string[] };

/**
 * Ghi cờ mâu thuẫn CÓ CẤU TRÚC vào `kb_chunks.metadata` của bản nháp (`conflict_group`, `conflict_values`): trước hết xóa cờ cũ ở mọi đoạn
 * nháp (cờ lỗi thời), rồi gắn cờ mới cho các đoạn thuộc nhóm. Không đổi `content_hash` nên không tạo thay đổi giả khi xuất bản.
 */
export async function setDraftConflictMarks(
  tx: Database,
  workspaceId: string,
  marks: readonly ConflictMark[],
): Promise<void> {
  await tx.execute(sql`
    UPDATE cf.kb_chunks SET metadata = metadata - 'conflict_group' - 'conflict_values'
     WHERE workspace_id = ${workspaceId}::uuid AND version_id IS NULL AND is_draft
       AND (metadata ? 'conflict_group' OR metadata ? 'conflict_values')`);
  for (const mark of marks) {
    await tx.execute(sql`
      UPDATE cf.kb_chunks
         SET metadata = metadata || jsonb_build_object('conflict_group', ${mark.group}::text, 'conflict_values', ${JSON.stringify(mark.values)}::jsonb)
       WHERE workspace_id = ${workspaceId}::uuid AND version_id IS NULL AND is_draft
         AND chunk_key IN (SELECT jsonb_array_elements_text(${JSON.stringify(mark.chunkKeys)}::jsonb))`);
  }
}

export type DraftChunkSummary = { source: string; chunks: number; withVector: number };

/**
 * Tóm tắt đoạn nháp theo loại nguồn đồng bộ (`sync:policy|product|faq|shop`, nguồn khác ghi `other`): số đoạn và số đoạn CÓ vector đúng model
 * đang hoạt động (`embedding_model` = `activeModel`). Chỉ đọc; dùng cho báo cáo lệnh dev `kb:sync`.
 */
export async function summarizeDraftChunks(
  tx: Database,
  workspaceId: string,
  activeModel: string,
): Promise<DraftChunkSummary[]> {
  const r = await tx.execute<{ source: string; chunks: number; with_vector: number }>(sql`
    SELECT coalesce(replace(s.external_key, 'sync:', ''), 'other') AS source,
           count(*)::int AS chunks,
           count(*) FILTER (WHERE c.embedding IS NOT NULL AND c.embedding_model = ${activeModel})::int AS with_vector
      FROM cf.kb_chunks c JOIN cf.kb_sources s ON s.id = c.source_id
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.version_id IS NULL AND c.is_draft
     GROUP BY 1 ORDER BY 1`);
  return r.rows.map((row) => ({
    source: row.source,
    chunks: row.chunks,
    withVector: row.with_vector,
  }));
}

/** Sản phẩm CHƯA có vector tên ở model `model` (NULL hoặc khác model), tối đa `limit` — để nhúng bù khi đồng bộ (khớp sản phẩm lai). */
export async function listProductNamesToEmbed(
  tx: Database,
  workspaceId: string,
  model: string,
  limit: number,
): Promise<Array<{ id: string; name: string }>> {
  const result = await tx.execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active'
       AND (name_embedding IS NULL OR name_embedding_model IS DISTINCT FROM ${model})
     ORDER BY id LIMIT ${limit}`);
  return result.rows.map((row) => ({ id: row.id, name: row.name }));
}
