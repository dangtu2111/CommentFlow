import { type PriceSnapshot, priceSnapshotSchema } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Bản nháp AI + ảnh chụp giá lúc soạn (FR-029, FR-111, migration 0046, Q-PS1). Ghi bằng `withJob` (pipeline soạn;
 * RLS chỉ cho hệ thống INSERT). `priceSnapshot` được kiểm Zod ở đây — dữ liệu hỏng bị từ chối TRƯỚC khi vào DB,
 * và sau INSERT cột này bất biến (không có quyền UPDATE).
 */
export type NewDraft = {
  targetType: 'comment' | 'message';
  targetId: string;
  text: string;
  lang: 'vi' | 'en';
  sources?: string[];
  confidence?: number | null;
  needsHuman?: boolean;
  reason?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  kbVersion?: number | null;
  action?: 'answer' | 'clarify' | 'redirect' | 'handoff';
  variants?: string[];
  claims?: unknown[];
  unansweredTopics?: string[];
  traceId?: string | null;
  /** Ảnh chụp giá/tồn lúc soạn (`buildPriceSnapshot`); `[]` khi câu không có số tiền. */
  priceSnapshot: PriceSnapshot;
  /** Kết quả bước `extract` (đã che PII). */
  extracted?: unknown;
  /** Thành phần độ tin cậy (FR-032); null khi không đọc được. */
  confidenceComponents?: unknown;
  /** Tham chiếu ngữ cảnh (luồng hội thoại…). */
  contextRefs?: unknown[];
};

export async function insertDraft(
  tx: Database,
  workspaceId: string,
  draft: NewDraft,
): Promise<string> {
  const snapshot = priceSnapshotSchema.parse(draft.priceSnapshot);
  const topics = draft.unansweredTopics ?? [];
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.drafts (workspace_id, target_type, target_id, text, lang, sources, confidence, needs_human,
      reason, model, prompt_version, kb_version, action, variants, claims, unanswered_topics, trace_id, price_snapshot,
      extracted, confidence_components, context_refs)
    VALUES (${workspaceId}::uuid, ${draft.targetType}, ${draft.targetId}::uuid, ${draft.text}, ${draft.lang},
      ${JSON.stringify(draft.sources ?? [])}::jsonb, ${draft.confidence ?? null}, ${draft.needsHuman ?? false},
      ${draft.reason ?? null}, ${draft.model ?? null}, ${draft.promptVersion ?? null}, ${draft.kbVersion ?? null},
      ${draft.action ?? 'answer'}, ${JSON.stringify(draft.variants ?? [])}::jsonb,
      ${JSON.stringify(draft.claims ?? [])}::jsonb, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(topics)}::jsonb)),
      ${draft.traceId ?? null}, ${JSON.stringify(snapshot)}::jsonb,
      ${draft.extracted === undefined ? null : JSON.stringify(draft.extracted)}::jsonb,
      ${draft.confidenceComponents == null ? null : JSON.stringify(draft.confidenceComponents)}::jsonb,
      ${JSON.stringify(draft.contextRefs ?? [])}::jsonb)
    RETURNING id`);
  const row = r.rows[0];
  if (!row) throw new Error('insert drafts không trả dòng nào');
  return row.id;
}

/**
 * Cột `price_snapshot` THÔ của bản nháp (jsonb đã parse) để đưa cho `priceEntriesFromSnapshot` (`@flow/ai`).
 * `null` = không có bản nháp (sai id / workspace khác — RLS ẩn). Không parse ở đây: cột hỏng được R5 xử lý
 * an toàn (`price_snapshot_missing` → chặn) thay vì ném lỗi làm kẹt job gửi.
 */
export async function getDraftPriceSnapshot(
  tx: Database,
  workspaceId: string,
  draftId: string,
): Promise<unknown | null> {
  const r = await tx.execute<{ price_snapshot: unknown }>(sql`
    SELECT price_snapshot FROM cf.drafts
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${draftId}::uuid`);
  const row = r.rows[0];
  return row === undefined ? null : row.price_snapshot;
}
