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
    RETURNING id`);
  return (result.rows[0] as { id: string }).id;
}

/**
 * Owner duyệt một bản NHÁP: thay bản đã duyệt cũ của cùng (kind, slot) (nếu có) bằng nội dung bản nháp; bản nháp được thăng cấp. Trả `true` nếu có bản nháp để duyệt.
 * Phải chạy trong MỘT giao dịch `withActor` của Owner (trigger từ chối nếu không phải Owner).
 */
export async function approvePolicyFact(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const draft = await tx.execute<{ kind: string; slot: string }>(sql`
    SELECT kind, slot FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'`);
  const row = draft.rows[0];
  if (!row) return false;
  await tx.execute(sql`
    DELETE FROM cf.policy_facts
     WHERE workspace_id = ${workspaceId}::uuid AND kind = ${row.kind} AND slot = ${row.slot} AND status = 'approved'`);
  const updated = await tx.execute(sql`
    UPDATE cf.policy_facts SET status = 'approved'
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid AND status = 'draft'
    RETURNING id`);
  return updated.rows.length > 0;
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
