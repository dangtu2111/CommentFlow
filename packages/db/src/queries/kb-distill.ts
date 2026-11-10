import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * KB-DISTILL (M3, migration 0084): đọc/ghi cho bước chắt lọc kiến thức thô thành FAQ/thuộc tính NHÁP.
 * Job hệ thống chỉ được ghi dòng `draft` (trigger `faq_items_guard_publish` chặn đưa lên `published`); chỉ Owner duyệt/từ chối.
 */

export type DistillChunkRow = { id: string; content: string; contentHash: string };

/**
 * Đoạn nháp chưa chắt lọc ở bản nội dung HIỆN TẠI: không nghi cài lệnh, không phải đoạn FAQ (nguồn `sync:faq`), và `metadata.distill_hash` khác `content_hash`
 * (đoạn đổi nội dung → hash mới → được chắt lọc lại; không đổi → bỏ qua, nên mỗi bản nội dung chỉ tốn một lần gọi LLM).
 */
export async function listChunksToDistill(
  tx: Database,
  workspaceId: string,
  limit: number,
): Promise<DistillChunkRow[]> {
  const r = await tx.execute<{ id: string; content: string; content_hash: string }>(sql`
    SELECT c.id, c.content, c.content_hash
      FROM cf.kb_chunks c JOIN cf.kb_sources s ON s.id = c.source_id AND s.workspace_id = c.workspace_id
     WHERE c.workspace_id = ${workspaceId}::uuid AND c.version_id IS NULL AND c.is_draft
       AND NOT c.injection_suspected
       AND s.external_key IS DISTINCT FROM 'sync:faq'
       AND c.metadata ->> 'distill_hash' IS DISTINCT FROM c.content_hash
     ORDER BY c.chunk_key
     LIMIT ${limit}`);
  return r.rows.map((row) => ({ id: row.id, content: row.content, contentHash: row.content_hash }));
}

/** Đánh dấu đoạn đã chắt lọc ở bản nội dung này (chỉ khi `content_hash` vẫn đúng bản đã đọc). */
export async function markChunksDistilled(
  tx: Database,
  workspaceId: string,
  chunks: ReadonlyArray<{ id: string; contentHash: string }>,
): Promise<void> {
  for (const chunk of chunks) {
    await tx.execute(sql`
      UPDATE cf.kb_chunks SET metadata = metadata || jsonb_build_object('distill_hash', ${chunk.contentHash}::text)
       WHERE workspace_id = ${workspaceId}::uuid AND id = ${chunk.id}::uuid AND content_hash = ${chunk.contentHash}`);
  }
}

export type DistilledFaqInsert = {
  kind: 'faq' | 'product_attr';
  question: string;
  answer: string;
  lang: 'vi' | 'en' | 'all';
  evidenceQuote: string;
  sourceChunkId: string;
};

/** Chèn nháp chắt lọc (`status='draft'`); bỏ qua câu hỏi đã có (nháp hoặc đã duyệt, không phân biệt hoa thường). Trả số dòng chèn. */
export async function insertDistilledFaqDrafts(
  tx: Database,
  workspaceId: string,
  items: readonly DistilledFaqInsert[],
): Promise<number> {
  let inserted = 0;
  for (const item of items) {
    const r = await tx.execute(sql`
      INSERT INTO cf.faq_items (workspace_id, question, answer, lang, status, kind, evidence_quote, source_chunk_id)
      SELECT ${workspaceId}::uuid, ${item.question}, ${item.answer}, ${item.lang}, 'draft', ${item.kind}, ${item.evidenceQuote}, ${item.sourceChunkId}::uuid
       WHERE NOT EXISTS (
         SELECT 1 FROM cf.faq_items f
          WHERE f.workspace_id = ${workspaceId}::uuid AND lower(f.question) = lower(${item.question}))
      RETURNING id`);
    inserted += r.rows.length;
  }
  return inserted;
}

export type DraftFaqRow = {
  id: string;
  question: string;
  answer: string;
  lang: string;
  kind: string;
  evidenceQuote: string | null;
  createdAt: Date;
};

/** Nháp chờ Owner duyệt, mới nhất trước. */
export async function listDraftFaqs(tx: Database, workspaceId: string): Promise<DraftFaqRow[]> {
  const r = await tx.execute<{
    id: string;
    question: string;
    answer: string;
    lang: string;
    kind: string;
    evidence_quote: string | null;
    created_at: string | Date;
  }>(sql`
    SELECT id, question, answer, lang, kind, evidence_quote, created_at FROM cf.faq_items
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'draft'
     ORDER BY created_at DESC, id LIMIT 200`);
  return r.rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    lang: row.lang,
    kind: row.kind,
    evidenceQuote: row.evidence_quote,
    createdAt: new Date(row.created_at),
  }));
}

/** Owner duyệt một nháp → `published` (vào kiến thức ở lần đồng bộ kế). Chỉ đổi dòng đang `draft`; chạy trong `withActor` của Owner. Trả `false` nếu không có dòng nháp. */
export async function approveDraftFaq(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.faq_items SET status = 'published', updated_at = now()
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
    RETURNING id`);
  return r.rows.length > 0;
}

/** Owner từ chối một nháp → xóa (chỉ dòng đang `draft`). */
export async function rejectDraftFaq(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    DELETE FROM cf.faq_items WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
    RETURNING id`);
  return r.rows.length > 0;
}

/** Số nháp đang chờ duyệt (huy hiệu trên tab). */
export async function countDraftFaqs(tx: Database, workspaceId: string): Promise<number> {
  const r = await tx.execute<{ n: string }>(
    sql`SELECT count(*) AS n FROM cf.faq_items WHERE workspace_id = ${workspaceId}::uuid AND status = 'draft'`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Tên workspace + một Owner (id người dùng) — CHỈ cho lệnh dev duyệt hàng loạt trên bộ đo `[EVAL]`; không dùng ở web/worker chạy thật. */
export async function loadWorkspaceNameAndOwner(
  tx: Database,
  workspaceId: string,
): Promise<{ name: string; ownerUserId: string | null }> {
  const w = await tx.execute<{ name: string }>(
    sql`SELECT name FROM core.workspaces WHERE id = ${workspaceId}::uuid`,
  );
  const o = await tx.execute<{ user_id: string }>(
    sql`SELECT user_id FROM core.workspace_members WHERE workspace_id = ${workspaceId}::uuid AND role = 'owner' LIMIT 1`,
  );
  return { name: w.rows[0]?.name ?? '', ownerUserId: o.rows[0]?.user_id ?? null };
}
