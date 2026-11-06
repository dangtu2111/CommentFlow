import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Quy tắc spam theo workspace (FR-080, migration 0049, Q-SRS1). Đầu vào ghi PHẢI đã qua `parseSpamRule`
 * (`@flow/shared`); lớp này chỉ lưu/đọc, DB giữ CHECK làm chốt cuối. Ghi: `withActor` (Owner, `userId` = chính họ) hoặc
 * `withJob` (`userId` null); RLS chặn Staff, workspace khác, người ngoài. Đọc: thành viên hoặc ngữ cảnh không người dùng.
 * Nội dung quy tắc bất biến: chỉ `enabled`/`shadow_until` đổi được; sửa nội dung = xóa + tạo lại.
 */
export const SPAM_RULES_MAX_PER_WORKSPACE = 50;

export type SpamRuleInput = {
  name: string;
  type: 'keyword' | 'regex' | 'phone' | 'link' | 'emoji_only' | 'tag_only';
  pattern: string;
  action: 'mark' | 'skip';
};

export type SpamRuleRow = SpamRuleInput & {
  id: string;
  enabled: boolean;
  shadowUntil: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

/** Workspace đã đủ trần quy tắc (`SPAM_RULES_MAX_PER_WORKSPACE`). */
export class SpamRuleLimitError extends Error {
  readonly code = 'spam_rule_limit';
  constructor() {
    super(`Mỗi workspace tối đa ${SPAM_RULES_MAX_PER_WORKSPACE} quy tắc spam`);
  }
}

type RawRule = {
  id: string;
  name: string;
  type: SpamRuleInput['type'];
  pattern: string;
  action: SpamRuleInput['action'];
  enabled: boolean;
  // `tx.execute` thô trả timestamptz dạng chuỗi → ép về Date.
  shadow_until: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
};

/** Quy tắc của workspace theo thứ tự tạo. */
export async function listSpamRules(tx: Database, workspaceId: string): Promise<SpamRuleRow[]> {
  const r = await tx.execute<RawRule>(sql`
    SELECT id, name, type, pattern, action, enabled, shadow_until, created_by, created_at
    FROM cf.rules WHERE workspace_id = ${workspaceId}::uuid ORDER BY created_at, id`);
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    type: x.type,
    pattern: x.pattern,
    action: x.action,
    enabled: x.enabled,
    shadowUntil: x.shadow_until === null ? null : new Date(x.shadow_until),
    createdBy: x.created_by,
    createdAt: new Date(x.created_at),
  }));
}

/**
 * Tạo quy tắc (mặc định bật), trả id. Trần 50/workspace: khóa tư vấn theo workspace nối đuôi hai lần tạo đồng thời
 * rồi đếm → vượt trần ném `SpamRuleLimitError`. Staff/người ngoài → 42501 (RLS); vi phạm CHECK → 23514.
 */
export async function createSpamRule(
  tx: Database,
  workspaceId: string,
  userId: string | null,
  input: SpamRuleInput,
): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`spam_rules:${workspaceId}`}))`);
  const count = await tx.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM cf.rules WHERE workspace_id = ${workspaceId}::uuid`);
  if ((count.rows[0]?.n ?? 0) >= SPAM_RULES_MAX_PER_WORKSPACE) throw new SpamRuleLimitError();
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.rules (workspace_id, name, type, pattern, action, created_by)
    VALUES (${workspaceId}::uuid, ${input.name}, ${input.type}, ${input.pattern}, ${input.action},
      ${userId}::uuid)
    RETURNING id`);
  const id = r.rows[0]?.id;
  if (!id) throw new Error('Không tạo được quy tắc spam');
  return id;
}

/** Bật/tắt. `true` nếu có dòng đổi; `false` nếu không thấy/không có quyền ghi (RLS lọc dòng). */
export async function setSpamRuleEnabled(
  tx: Database,
  workspaceId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.rules SET enabled = ${enabled}, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

/** Xóa. `true` nếu có dòng bị xóa; `false` nếu không thấy/không có quyền ghi. */
export async function deleteSpamRule(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    DELETE FROM cf.rules WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  return (r.rowCount ?? 0) > 0;
}
