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
  }>;
  truncated: boolean;
}> {
  const r = await tx.execute<{
    id: string;
    name: string;
    sku: string | null;
    variants: unknown;
  }>(sql`
    SELECT id, name, sku, variants FROM cf.products
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'active'
     ORDER BY created_at, id LIMIT ${limit + 1}`);
  const rows = r.rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    options: variantOptionsOf(row.variants),
  }));
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
