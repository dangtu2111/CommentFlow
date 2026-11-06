import type { LeadStage, LeadUpdate } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Khách tiềm năng (FR-082, migration 0051, Q-LDS1). Lớp này chỉ lưu/đọc BẢN MÃ + BĂM do `lead-vault.ts` tạo — không
 * bao giờ nhận/trả SĐT hay email thô. Ghi lead mới: `withJob` (hệ thống). Đổi giai đoạn/ghi chú/giao người:
 * `withActor` (thành viên). Xóa: Owner hoặc hệ thống. RLS + trigger là chốt cuối (42501 / 23514).
 */
export const LEADS_PAGE_MAX = 100;

export type LeadSourceType = 'comment' | 'message';

export type PreparedContact = { enc: Buffer; hash: Buffer };

/** Một lead đã mã hóa, sẵn sàng ghi. `id` sinh ở ứng dụng vì nằm trong AAD của bản mã. */
export type PreparedLead = {
  id: string;
  channelId: string;
  sourceType: LeadSourceType;
  sourceId: string | null;
  phone: (PreparedContact & { last4: string }) | null;
  email: PreparedContact | null;
  keyVersion: number;
};

export type LeadRow = {
  id: string;
  channelId: string;
  sourceType: LeadSourceType;
  sourceId: string | null;
  name: string | null;
  phoneLast4: string | null;
  hasEmail: boolean;
  note: string | null;
  stage: LeadStage;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RawLead = {
  id: string;
  channel_id: string;
  source_type: LeadSourceType;
  source_id: string | null;
  name: string | null;
  phone_last4: string | null;
  has_email: boolean;
  note: string | null;
  stage: LeadStage;
  assigned_to: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const toRow = (x: RawLead): LeadRow => ({
  id: x.id,
  channelId: x.channel_id,
  sourceType: x.source_type,
  sourceId: x.source_id,
  name: x.name,
  phoneLast4: x.phone_last4,
  hasEmail: x.has_email,
  note: x.note,
  stage: x.stage,
  assignedTo: x.assigned_to,
  createdAt: new Date(x.created_at),
  updatedAt: new Date(x.updated_at),
});

/**
 * Ghi các lead đã mã hóa (chỉ `withJob`). Trùng (cùng băm SĐT hoặc email trong workspace) → không tạo mới, chỉ chạm
 * `updated_at` (đẩy lead lên đầu) và KHÔNG trộn liên hệ vào lead cũ. Khóa tư vấn theo workspace nối đuôi hai lần ghi
 * đồng thời nên không đụng chỉ mục duy nhất. Trả `id` thật của từng lead + `created`.
 */
export async function recordLeads(
  tx: Database,
  workspaceId: string,
  leads: readonly PreparedLead[],
): Promise<Array<{ id: string; created: boolean }>> {
  if (leads.length === 0) return [];
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`leads:${workspaceId}`}))`);
  const results: Array<{ id: string; created: boolean }> = [];
  for (const lead of leads) {
    const existing = await tx.execute<{ id: string }>(sql`
      SELECT id FROM cf.leads
      WHERE workspace_id = ${workspaceId}::uuid
        AND ((${lead.phone?.hash ?? null}::bytea IS NOT NULL AND phone_hash = ${lead.phone?.hash ?? null}::bytea)
          OR (${lead.email?.hash ?? null}::bytea IS NOT NULL AND email_hash = ${lead.email?.hash ?? null}::bytea))
      ORDER BY created_at LIMIT 1`);
    const found = existing.rows[0]?.id;
    if (found) {
      await tx.execute(
        sql`UPDATE cf.leads SET updated_at = now() WHERE workspace_id = ${workspaceId}::uuid AND id = ${found}::uuid`,
      );
      results.push({ id: found, created: false });
      continue;
    }
    await tx.execute(sql`
      INSERT INTO cf.leads (id, workspace_id, channel_id, source_type, source_id, phone_enc, phone_hash, phone_last4,
        email_enc, email_hash, key_version)
      VALUES (${lead.id}::uuid, ${workspaceId}::uuid, ${lead.channelId}::uuid, ${lead.sourceType},
        ${lead.sourceId}::uuid, ${lead.phone?.enc ?? null}::bytea, ${lead.phone?.hash ?? null}::bytea,
        ${lead.phone?.last4 ?? null}, ${lead.email?.enc ?? null}::bytea, ${lead.email?.hash ?? null}::bytea,
        ${lead.keyVersion}::integer)`);
    results.push({ id: lead.id, created: true });
  }
  return results;
}

export type ListLeadsOptions = {
  stage?: LeadStage;
  assignedTo?: string;
  /** Con trỏ phân trang: chỉ lấy lead tạo TRƯỚC mốc này. */
  before?: Date;
  limit?: number;
};

/** Danh sách mới nhất trước (không trả bản mã). */
export async function listLeads(
  tx: Database,
  workspaceId: string,
  options: ListLeadsOptions = {},
): Promise<LeadRow[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), LEADS_PAGE_MAX);
  const r = await tx.execute<RawLead>(sql`
    SELECT id, channel_id, source_type, source_id, name, phone_last4, (email_enc IS NOT NULL) AS has_email, note,
      stage, assigned_to, created_at, updated_at
    FROM cf.leads
    WHERE workspace_id = ${workspaceId}::uuid
      AND (${options.stage ?? null}::text IS NULL OR stage = ${options.stage ?? null})
      AND (${options.assignedTo ?? null}::uuid IS NULL OR assigned_to = ${options.assignedTo ?? null}::uuid)
      AND (${options.before ?? null}::timestamptz IS NULL OR created_at < ${options.before ?? null}::timestamptz)
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}`);
  return r.rows.map(toRow);
}

/** Số lead theo giai đoạn (đủ 4 cột Kanban, cột trống = 0). */
export async function countLeadsByStage(
  tx: Database,
  workspaceId: string,
): Promise<Record<LeadStage, number>> {
  const r = await tx.execute<{ stage: LeadStage; n: number }>(sql`
    SELECT stage, count(*)::int AS n FROM cf.leads WHERE workspace_id = ${workspaceId}::uuid GROUP BY stage`);
  const counts: Record<LeadStage, number> = { new: 0, contacted: 0, won: 0, lost: 0 };
  for (const row of r.rows) counts[row.stage] = row.n;
  return counts;
}

export type LeadCipherRow = {
  phoneEnc: Buffer | null;
  emailEnc: Buffer | null;
  keyVersion: number;
};

/** Bản mã của một lead để giải mã ở tầng ứng dụng (chỉ khi cần hiển thị số/email đầy đủ). `null` = không thấy. */
export async function getLeadCipher(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<LeadCipherRow | null> {
  const r = await tx.execute<{
    phone_enc: Buffer | null;
    email_enc: Buffer | null;
    key_version: number;
  }>(sql`
    SELECT phone_enc, email_enc, key_version FROM cf.leads
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid
      AND ((SELECT core.is_workspace_member()) OR (SELECT core.is_system_context()))`);
  const row = r.rows[0];
  if (!row) return null;
  return {
    phoneEnc: row.phone_enc ? Buffer.from(row.phone_enc) : null,
    emailEnc: row.email_enc ? Buffer.from(row.email_enc) : null,
    keyVersion: row.key_version,
  };
}

/**
 * Cập nhật giai đoạn/tên/ghi chú/người được giao (đầu vào đã qua `parseLeadUpdate`). `true` nếu có dòng đổi; `false`
 * nếu không thấy. Giao cho người không phải thành viên đang hoạt động → 23514 (trigger).
 */
export async function updateLead(
  tx: Database,
  workspaceId: string,
  id: string,
  patch: LeadUpdate,
): Promise<boolean> {
  const sets = [sql`updated_at = now()`];
  if (patch.stage !== undefined) sets.push(sql`stage = ${patch.stage}`);
  if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`);
  if (patch.note !== undefined) sets.push(sql`note = ${patch.note}`);
  if (patch.assignedTo !== undefined) sets.push(sql`assigned_to = ${patch.assignedTo}::uuid`);
  const r = await tx.execute(sql`
    UPDATE cf.leads SET ${sql.join(sets, sql`, `)}
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

/** Xóa lead (Owner hoặc hệ thống). `true` nếu có dòng bị xóa; `false` nếu không thấy/không đủ quyền. */
export async function deleteLead(tx: Database, workspaceId: string, id: string): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.leads WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}
