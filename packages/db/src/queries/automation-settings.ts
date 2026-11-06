import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Cấu hình cổng tự gửi (FR-070/071, migration 0047, Q-ACS1). Đầu vào ghi PHẢI đã qua `parseAutomationConfig`
 * (`@flow/ai`); lớp này chỉ lưu/đọc, DB giữ CHECK làm chốt cuối. Ghi: `withActor` (Owner) hoặc `withJob` (updatedBy
 * null); RLS chặn Staff, workspace khác, người ngoài. Đọc: mọi thành viên hoặc ngữ cảnh không người dùng.
 */
export type AutomationRuleRow = {
  channelId: string;
  target: 'comment' | 'message';
  label: 'price' | 'advice' | 'purchase';
  mode: 'off' | 'shadow' | 'auto';
};

export type AutomationSettingsInput = {
  threshold: number;
  delaySeconds: number;
  dailyCap: number;
  activeHours: Record<string, unknown> | null;
  blockedKeywords: readonly string[];
  signature: string | null;
  rules: readonly AutomationRuleRow[];
};

export type AutomationSettingsRow = AutomationSettingsInput & {
  rules: AutomationRuleRow[];
  blockedKeywords: string[];
  updatedBy: string | null;
  updatedAt: Date;
};

type RawSettings = {
  threshold: number;
  delay_seconds: number;
  daily_cap: number;
  active_hours: Record<string, unknown> | null;
  blocked_keywords: string[];
  signature: string | null;
  updated_by: string | null;
  // `tx.execute` thô trả timestamptz dạng chuỗi → ép về Date.
  updated_at: Date | string;
};

type RawRule = {
  channel_id: string;
  target: AutomationRuleRow['target'];
  label: AutomationRuleRow['label'];
  mode: AutomationRuleRow['mode'];
};

/** `null` khi workspace chưa từng lưu (nơi gọi dùng mặc định: mọi ô Tắt). */
export async function getAutomationSettings(
  tx: Database,
  workspaceId: string,
): Promise<AutomationSettingsRow | null> {
  const s = await tx.execute<RawSettings>(sql`
    SELECT threshold, delay_seconds, daily_cap, active_hours, blocked_keywords, signature, updated_by, updated_at
    FROM cf.automation_settings WHERE workspace_id = ${workspaceId}::uuid`);
  const row = s.rows[0];
  if (!row) return null;
  const r = await tx.execute<RawRule>(sql`
    SELECT channel_id, target, label, mode FROM cf.automation_rules
    WHERE workspace_id = ${workspaceId}::uuid ORDER BY channel_id, target, label`);
  return {
    threshold: row.threshold,
    delaySeconds: row.delay_seconds,
    dailyCap: row.daily_cap,
    activeHours: row.active_hours,
    blockedKeywords: row.blocked_keywords,
    signature: row.signature,
    updatedBy: row.updated_by,
    updatedAt: new Date(row.updated_at),
    rules: r.rows.map((x) => ({
      channelId: x.channel_id,
      target: x.target,
      label: x.label,
      mode: x.mode,
    })),
  };
}

/**
 * Lưu toàn bộ cấu hình trong MỘT giao dịch của `tx`: upsert dòng chung (khóa dòng → hai lần lưu đồng thời nối đuôi
 * nhau), xóa rồi chèn lại các ô ma trận. `userId` = Owner đang ghi (RLS buộc `updated_by` = chính họ); `null` = hệ
 * thống. Kênh không thuộc workspace → lỗi khóa ngoại 23503; Staff → 42501.
 */
export async function saveAutomationSettings(
  tx: Database,
  workspaceId: string,
  userId: string | null,
  input: AutomationSettingsInput,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO cf.automation_settings
      (workspace_id, threshold, delay_seconds, daily_cap, active_hours, blocked_keywords, signature, updated_by)
    VALUES (${workspaceId}::uuid, ${input.threshold}, ${input.delaySeconds}, ${input.dailyCap},
      ${input.activeHours === null ? null : JSON.stringify(input.activeHours)}::jsonb,
      ARRAY(SELECT x.t FROM jsonb_array_elements_text(${JSON.stringify(input.blockedKeywords)}::jsonb)
        WITH ORDINALITY AS x(t, i) ORDER BY x.i),
      ${input.signature}, ${userId}::uuid)
    ON CONFLICT (workspace_id) DO UPDATE SET
      threshold = EXCLUDED.threshold, delay_seconds = EXCLUDED.delay_seconds, daily_cap = EXCLUDED.daily_cap,
      active_hours = EXCLUDED.active_hours, blocked_keywords = EXCLUDED.blocked_keywords,
      signature = EXCLUDED.signature, updated_by = EXCLUDED.updated_by, updated_at = now()`);
  await tx.execute(sql`DELETE FROM cf.automation_rules WHERE workspace_id = ${workspaceId}::uuid`);
  if (input.rules.length === 0) return;
  await tx.execute(sql`
    INSERT INTO cf.automation_rules (workspace_id, channel_id, target, label, mode)
    SELECT ${workspaceId}::uuid, (e->>'channelId')::uuid, e->>'target', e->>'label', e->>'mode'
    FROM jsonb_array_elements(${JSON.stringify(input.rules)}::jsonb) AS e`);
}
