import type { KbChangeCategory, PlanChunk } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Xuất bản / khôi phục phiên bản kiến thức (FR-054, UF-8, Q-KPV1). Không migration.
 * - Đọc (`listKbVersions`, `listChunkSummaries`, `getCurrentVersion`, `getVersionByNumber`): thành viên workspace (RLS).
 * - Ghi (`lockKbPublish`, `createKbVersionFromChunks`): CHỈ `withJob` — RLS `kb_chunks_insert` đòi ngữ cảnh hệ thống (0033);
 *   `kb_versions` bất biến (chỉ INSERT). Không bao giờ UPDATE/DELETE đoạn hay phiên bản đã có.
 */

export type KbVersionRef = { id: string; number: number };

export type KbVersionRow = {
  id: string;
  number: number;
  publishedAt: Date;
  publishedBy: string | null;
  note: string | null;
  changedCategories: KbChangeCategory[];
  chunkCount: number;
};

/** Người yêu cầu còn là Owner đang hoạt động của workspace? Worker kiểm lại vì job đi qua hàng đợi (có thể trễ). */
export async function isActiveOwner(
  tx: Database,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    SELECT 1 FROM core.members
    WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid
      AND role = 'owner' AND status = 'active'`);
  return r.rows.length > 0;
}

export type ChunkScope = { kind: 'draft' } | { kind: 'version'; versionId: string };

/** Phiên bản đang chạy = số lớn nhất của workspace (chưa có cột con trỏ — gap KB-PUBLISH-POINTER). */
export async function getCurrentVersion(
  tx: Database,
  workspaceId: string,
): Promise<KbVersionRef | null> {
  const r = await tx.execute(sql`
    SELECT id, number FROM cf.kb_versions WHERE workspace_id = ${workspaceId}::uuid
    ORDER BY number DESC LIMIT 1`);
  const row = r.rows[0];
  return row ? { id: row.id as string, number: Number(row.number) } : null;
}

export async function getVersionByNumber(
  tx: Database,
  workspaceId: string,
  versionNumber: number,
): Promise<KbVersionRef | null> {
  const r = await tx.execute(sql`
    SELECT id, number FROM cf.kb_versions
    WHERE workspace_id = ${workspaceId}::uuid AND number = ${versionNumber}`);
  const row = r.rows[0];
  return row ? { id: row.id as string, number: Number(row.number) } : null;
}

export async function listKbVersions(tx: Database, workspaceId: string): Promise<KbVersionRow[]> {
  const r = await tx.execute(sql`
    SELECT v.id, v.number, v.published_at, v.published_by, v.note, v.changed_categories,
           (SELECT count(*) FROM cf.kb_chunks c
             WHERE c.workspace_id = v.workspace_id AND c.version_id = v.id) AS chunk_count
    FROM cf.kb_versions v
    WHERE v.workspace_id = ${workspaceId}::uuid
    ORDER BY v.number DESC`);
  return r.rows.map((row) => ({
    id: row.id as string,
    number: Number(row.number),
    publishedAt: new Date(row.published_at as string),
    publishedBy: (row.published_by as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    changedCategories: (row.changed_categories as KbChangeCategory[]) ?? [],
    chunkCount: Number(row.chunk_count),
  }));
}

/**
 * Tóm tắt đoạn (không nội dung) của nháp hoặc của một phiên bản, kèm loại nguồn. Nháp bỏ nguồn đã xóa mềm
 * (nguồn xóa thì đoạn nháp của nó không được xuất bản).
 */
export async function listChunkSummaries(
  tx: Database,
  workspaceId: string,
  scope: ChunkScope,
): Promise<PlanChunk[]> {
  const where =
    scope.kind === 'draft'
      ? sql`c.version_id IS NULL AND c.is_draft AND s.deleted_at IS NULL`
      : sql`c.version_id = ${scope.versionId}::uuid`;
  const r = await tx.execute(sql`
    SELECT c.source_id, s.type AS source_type, c.chunk_key, c.content_hash, c.injection_suspected
    FROM cf.kb_chunks c
    JOIN cf.kb_sources s ON s.workspace_id = c.workspace_id AND s.id = c.source_id
    WHERE c.workspace_id = ${workspaceId}::uuid AND ${where}
    ORDER BY c.source_id, c.chunk_key`);
  return r.rows.map((row) => ({
    sourceId: row.source_id as string,
    sourceType: row.source_type as string,
    chunkKey: row.chunk_key as string,
    contentHash: row.content_hash as string,
    injectionSuspected: Boolean(row.injection_suspected),
  }));
}

/**
 * Khóa tư vấn theo workspace trong giao dịch: hai job xuất bản/khôi phục cùng lúc xếp hàng, nên số phiên bản không
 * đụng `unique (workspace_id, number)`. Gọi TRƯỚC khi đọc phiên bản hiện tại.
 */
export async function lockKbPublish(tx: Database, workspaceId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`kb_publish:${workspaceId}`}, 0))`,
  );
}

export type CreateKbVersionInput = {
  number: number;
  publishedBy: string;
  note: string | null;
  changedCategories: KbChangeCategory[];
  scope: ChunkScope;
  keys: { sourceId: string; chunkKey: string }[];
};

/**
 * Tạo phiên bản mới và SAO các đoạn `keys` từ nháp/phiên bản nguồn (đoạn gốc giữ nguyên). Bản sao: `is_draft = false`,
 * không nghi cài lệnh (đã loại ở kế hoạch). Trả id phiên bản và số đoạn đã sao.
 */
export async function createKbVersionFromChunks(
  tx: Database,
  workspaceId: string,
  input: CreateKbVersionInput,
): Promise<{ versionId: string; copied: number }> {
  const created = await tx.execute(sql`
    INSERT INTO cf.kb_versions (workspace_id, number, published_by, note, changed_categories)
    VALUES (${workspaceId}::uuid, ${input.number}, ${input.publishedBy}::uuid, ${input.note},
      ${`{${input.changedCategories.join(',')}}`}::text[])
    RETURNING id`);
  const versionId = created.rows[0]?.id as string;
  const wanted = JSON.stringify(
    input.keys.map((k) => ({ source_id: k.sourceId, chunk_key: k.chunkKey })),
  );
  const origin =
    input.scope.kind === 'draft'
      ? sql`c.version_id IS NULL AND c.is_draft AND NOT c.injection_suspected`
      : sql`c.version_id = ${input.scope.versionId}::uuid`;
  const copied = await tx.execute(sql`
    INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, injection_suspected,
      injection_reason, content, lang, content_hash, embedding, tsv, search_norm, metadata, is_draft,
      context_header, product_id, valid_from, valid_until, embedding_model)
    SELECT c.workspace_id, c.source_id, ${versionId}::uuid, c.chunk_key, false, NULL, c.content, c.lang,
      c.content_hash, c.embedding, c.tsv, c.search_norm, c.metadata, false, c.context_header, c.product_id,
      c.valid_from, c.valid_until, c.embedding_model
    FROM cf.kb_chunks c
    JOIN jsonb_to_recordset(${wanted}::jsonb) AS k(source_id uuid, chunk_key text)
      ON k.source_id = c.source_id AND k.chunk_key = c.chunk_key
    WHERE c.workspace_id = ${workspaceId}::uuid AND ${origin}`);
  return { versionId, copied: copied.rowCount ?? 0 };
}
