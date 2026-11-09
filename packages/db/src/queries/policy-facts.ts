import {
  type PolicyFactKind,
  type PolicyFactOrigin,
  type PolicyFactStatus,
  parsePolicyFactData,
} from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Chính sách CÓ CẤU TRÚC (DRAFT-FACT-SLOTS, ADR 017). Mọi truy vấn lọc `workspace_id` và chạy trong `withActor` (Owner ghi/duyệt), `withJob` (hệ thống chỉ ghi ĐỀ XUẤT nháp) hoặc
 * `withWorkspace` (chỉ đọc). RLS + trigger `policy_facts_guard` là hàng rào thật; ở đây kiểm thêm `data` bằng Zod trước khi ghi.
 */
export type PolicyFactRow = {
  id: string;
  kind: PolicyFactKind;
  slot: string;
  data: unknown;
  status: PolicyFactStatus;
  origin: PolicyFactOrigin;
  evidence: string | null;
  sourceRef: string | null;
  rev: number;
};

const SELECT = sql`id, kind, slot, data, status, origin, evidence, source_ref AS "sourceRef", rev`;

/** Chỉ bản ĐÃ DUYỆT — đây là nguồn DUY NHẤT của fact plan; bản nháp không bao giờ vào đây. */
export async function listApprovedPolicyFacts(
  tx: Database,
  workspaceId: string,
): Promise<PolicyFactRow[]> {
  const result = await tx.execute<PolicyFactRow>(sql`
    SELECT ${SELECT} FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'approved'
     ORDER BY kind, slot`);
  return result.rows;
}

/** Cả nháp và đã duyệt (cho màn quản lý). */
export async function listAllPolicyFacts(
  tx: Database,
  workspaceId: string,
): Promise<PolicyFactRow[]> {
  const result = await tx.execute<PolicyFactRow>(sql`
    SELECT ${SELECT} FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid
     ORDER BY kind, slot, status`);
  return result.rows;
}

export type SavePolicyFactInput = {
  workspaceId: string;
  kind: PolicyFactKind;
  slot: string;
  data: unknown;
  status: PolicyFactStatus;
  origin: PolicyFactOrigin;
  evidence?: string | null;
  sourceRef?: string | null;
  /** Người đang ghi (chỉ khi `withActor`); thiếu → null. */
  createdBy?: string | null;
};

/**
 * Ghi (thêm hoặc thay) một dòng theo (kind, slot, status). `data` sai cấu trúc → ném lỗi, KHÔNG ghi. Owner ghi `approved` = duyệt luôn (trigger đóng dấu người duyệt); hệ thống chỉ
 * `draft` + origin ≠ manual (RLS). Trả `id`.
 */
export async function savePolicyFact(tx: Database, input: SavePolicyFactInput): Promise<string> {
  const parsed = parsePolicyFactData(input.kind, input.data);
  if (!parsed.success) throw new Error('Dữ liệu chính sách không hợp lệ.');
  const result = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.policy_facts (workspace_id, kind, slot, data, status, origin, evidence, source_ref, created_by)
    VALUES (${input.workspaceId}::uuid, ${input.kind}, ${input.slot}, ${JSON.stringify(parsed.data)}::jsonb,
            ${input.status}, ${input.origin}, ${input.evidence ?? null}, ${input.sourceRef ?? null},
            ${input.createdBy ?? null}::uuid)
    ON CONFLICT (workspace_id, kind, slot, status)
    DO UPDATE SET data = EXCLUDED.data, evidence = EXCLUDED.evidence, source_ref = EXCLUDED.source_ref
    WHERE cf.policy_facts.data IS DISTINCT FROM EXCLUDED.data
       OR cf.policy_facts.evidence IS DISTINCT FROM EXCLUDED.evidence
       OR cf.policy_facts.source_ref IS DISTINCT FROM EXCLUDED.source_ref
    RETURNING id`);
  if (result.rows[0]) return (result.rows[0] as { id: string }).id;
  // Không đổi gì (đồng bộ lại cùng nội dung): KHÔNG cập nhật để `rev` không tăng oan làm lệch bản Owner đang xem.
  const same = await tx.execute<{ id: string }>(sql`
    SELECT id FROM cf.policy_facts
     WHERE workspace_id = ${input.workspaceId}::uuid AND kind = ${input.kind} AND slot = ${input.slot} AND status = ${input.status}`);
  return (same.rows[0] as { id: string }).id;
}

export type EditPolicyDraftResult = 'edited' | 'not_found' | 'stale';

/**
 * Owner sửa tay một bản NHÁP (điều kiện/phạm vi/số liệu), KÈM `rev` đang xem. Dấu "đã qua tay Owner" = `origin = 'manual'` (không cần cột mới; `origin` bất biến và hệ thống không được ghi `manual`):
 * nháp của máy (`shopify_suggested`/`text_suggested`) được THAY bằng nháp `manual` cùng (kind, slot), giữ evidence/source_ref để Owner còn thấy nguồn; nháp đã `manual` thì cập nhật tại chỗ.
 * `data` sai cấu trúc → ném lỗi, không ghi. Lệch `rev` → 'stale'. Chạy trong MỘT giao dịch `withActor` của Owner. `needsReview` do Owner tự xác nhận khi duyệt, không bị gỡ ở đây.
 */
export async function editPolicyDraft(
  tx: Database,
  workspaceId: string,
  id: string,
  expectedRev: number,
  data: unknown,
  createdBy: string,
): Promise<EditPolicyDraftResult> {
  const found = await tx.execute<{
    kind: PolicyFactKind;
    slot: string;
    rev: number;
    origin: PolicyFactOrigin;
    evidence: string | null;
    sourceRef: string | null;
  }>(sql`
    SELECT kind, slot, rev, origin, evidence, source_ref AS "sourceRef" FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
       FOR UPDATE`);
  const row = found.rows[0];
  if (!row) return 'not_found';
  if (row.rev !== expectedRev) return 'stale';
  const parsed = parsePolicyFactData(row.kind, data);
  if (!parsed.success) throw new Error('Dữ liệu chính sách không hợp lệ.');
  if (row.origin === 'manual') {
    await tx.execute(sql`
      UPDATE cf.policy_facts SET data = ${JSON.stringify(parsed.data)}::jsonb
       WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'`);
    return 'edited';
  }
  await tx.execute(
    sql`DELETE FROM cf.policy_facts WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'`,
  );
  await savePolicyFact(tx, {
    workspaceId,
    kind: row.kind,
    slot: row.slot,
    data: parsed.data,
    status: 'draft',
    origin: 'manual',
    evidence: row.evidence,
    sourceRef: row.sourceRef,
    createdBy,
  });
  return 'edited';
}

export type ApprovePolicyFactResult = 'approved' | 'not_found' | 'stale' | 'needs_review';

/**
 * Owner duyệt một bản NHÁP, KÈM `rev` Owner đang xem: khóa dòng nháp rồi so `rev`; lệch (worker vừa làm mới nháp) → 'stale', KHÔNG duyệt. Khớp → trong MỘT giao dịch: nếu đã có bản duyệt cùng
 * (kind, slot) thì cập nhật CHÍNH bản đó theo nháp (giữ nguyên id, rev tăng) rồi xóa nháp; chưa có thì thăng cấp nháp. Phải chạy trong MỘT giao dịch `withActor` của Owner (trigger từ chối nếu không phải Owner).
 */
export async function approvePolicyFact(
  tx: Database,
  workspaceId: string,
  id: string,
  expectedRev: number,
  options: { confirmReview?: boolean } = {},
): Promise<ApprovePolicyFactResult> {
  const draft = await tx.execute<{ kind: string; slot: string; rev: number; review: boolean }>(sql`
    SELECT kind, slot, rev, coalesce((data->>'needsReview')::boolean, false) AS review FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
       FOR UPDATE`);
  const row = draft.rows[0];
  if (!row) return 'not_found';
  if (row.rev !== expectedRev) return 'stale';
  // Đề xuất của máy còn điều kiện/phạm vi chưa tách được (needsReview): Owner phải XÁC NHẬN rõ (đã chỉnh/đọc điều kiện) mới duyệt; khi xác nhận, cờ được gỡ khỏi bản đã duyệt.
  if (row.review && options.confirmReview !== true) return 'needs_review';
  const strip = options.confirmReview === true;
  // Đã có bản duyệt cùng (kind, slot): GIỮ NGUYÊN id của nó (pf:<id> ổn định cho claims/lịch sử/kiểm tra trước khi gửi) — chép data/evidence/source_ref từ nháp sang, rồi xóa nháp.
  const replaced = await tx.execute(sql`
    UPDATE cf.policy_facts AS cur
       SET data = CASE WHEN ${strip}::boolean THEN d.data - 'needsReview' ELSE d.data END, evidence = d.evidence, source_ref = d.source_ref
      FROM cf.policy_facts AS d
     WHERE cur.workspace_id = ${workspaceId}::uuid AND cur.kind = ${row.kind} AND cur.slot = ${row.slot} AND cur.status = 'approved'
       AND d.workspace_id = cur.workspace_id AND d.id = ${id}::uuid AND d.status = 'draft' AND d.rev = ${expectedRev}
    RETURNING cur.id`);
  if (replaced.rows.length > 0) {
    await tx.execute(
      sql`DELETE FROM cf.policy_facts WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'`,
    );
    return 'approved';
  }
  const updated = await tx.execute(sql`
    UPDATE cf.policy_facts
       SET status = 'approved', data = CASE WHEN ${strip}::boolean THEN data - 'needsReview' ELSE data END
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft' AND rev = ${expectedRev}
    RETURNING id`);
  return updated.rows.length > 0 ? 'approved' : 'stale';
}

export async function deletePolicyFact(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const result = await tx.execute(sql`
    DELETE FROM cf.policy_facts WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid RETURNING id`);
  return result.rows.length > 0;
}

export type PolicySuggestionInput = {
  kind: PolicyFactKind;
  slot: string;
  data: unknown;
  evidence: string;
};

/**
 * Hệ thống làm mới ĐỀ XUẤT nháp của một nguồn (`origin`): mỗi đề xuất → bản nháp (không đổi nội dung thì không đụng, `rev` giữ nguyên); đề xuất trùng hệt bản ĐÃ DUYỆT cùng slot → không tạo nháp
 * (và dọn nháp cũ của slot đó); nháp của nguồn này mà lần này không còn được đề xuất → xóa. Dữ liệu sai cấu trúc bị bỏ. KHÔNG BAO GIỜ đụng bản đã duyệt hay nháp của nguồn khác. Chạy trong `withJob`.
 */
export async function refreshPolicySuggestions(
  tx: Database,
  workspaceId: string,
  origin: Exclude<PolicyFactOrigin, 'manual'>,
  suggestions: readonly PolicySuggestionInput[],
  sourceRef: string | null = null,
): Promise<{ drafted: number; removed: number }> {
  const approved = await listApprovedPolicyFacts(tx, workspaceId);
  // Bản nháp Owner đã sửa tay (origin = 'manual') — đồng bộ KHÔNG được ghi đè hay xóa (POLICY-DRAFT-OWNER-EDIT).
  const ownerTouched = await tx.execute<{ kind: string; slot: string }>(sql`
    SELECT kind, slot FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'draft' AND origin = 'manual'`);
  const touched = new Set(ownerTouched.rows.map((row) => `${row.kind}\u0000${row.slot}`));
  const keep = new Set<string>();
  let drafted = 0;
  for (const suggestion of suggestions) {
    const parsed = parsePolicyFactData(suggestion.kind, suggestion.data);
    if (!parsed.success) continue;
    const key = `${suggestion.kind}\u0000${suggestion.slot}`;
    if (touched.has(key)) continue;
    const sameApproved = approved.some(
      (row) =>
        row.kind === suggestion.kind &&
        row.slot === suggestion.slot &&
        JSON.stringify(sortKeys(row.data)) === JSON.stringify(sortKeys(parsed.data)),
    );
    if (sameApproved) continue;
    keep.add(key);
    await savePolicyFact(tx, {
      workspaceId,
      kind: suggestion.kind,
      slot: suggestion.slot,
      data: parsed.data,
      status: 'draft',
      origin,
      evidence: suggestion.evidence,
      sourceRef,
    });
    drafted += 1;
  }
  const drafts = await tx.execute<{ id: string; kind: string; slot: string }>(sql`
    SELECT id, kind, slot FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND status = 'draft' AND origin = ${origin}`);
  let removed = 0;
  for (const draft of drafts.rows) {
    if (keep.has(`${draft.kind}\u0000${draft.slot}`)) continue;
    await tx.execute(
      sql`DELETE FROM cf.policy_facts WHERE workspace_id = ${workspaceId}::uuid AND id = ${draft.id}::uuid AND status = 'draft'`,
    );
    removed += 1;
  }
  return { drafted, removed };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}
