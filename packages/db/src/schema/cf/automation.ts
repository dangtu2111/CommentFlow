import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  foreignKey,
  integer,
  jsonb,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../core/auth';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';
import { channels } from './channels';

export const AUTOMATION_RULE_TARGETS = ['comment', 'message'] as const;
export const AUTOMATION_RULE_LABELS = ['price', 'advice', 'purchase'] as const;
export const AUTOMATION_RULE_MODES = ['off', 'shadow', 'auto'] as const;

/**
 * Cài đặt chung của cổng tự gửi — MỘT dòng mỗi workspace (FR-071, docs/10 `automation_settings`, Q-ACS1).
 * Ngưỡng có sàn 0,80 ở cả DB (phòng thủ chiều sâu; cổng tự gửi cũng kẹp sàn). Chỉ Owner (hoặc hệ thống) ghi.
 */
export const automationSettings = cf.table(
  'automation_settings',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    threshold: doublePrecision('threshold').notNull().default(0.85),
    delaySeconds: integer('delay_seconds').notNull().default(60),
    dailyCap: integer('daily_cap').notNull().default(50),
    /** `{days:number[], from:'HH:MM', to:'HH:MM'}` hoặc null (cả ngày); Zod kiểm hình dạng ở ranh giới. */
    activeHours: jsonb('active_hours'),
    blockedKeywords: text('blocked_keywords').array().notNull().default(sql`'{}'::text[]`),
    signature: text('signature'),
    /** Cửa sổ gộp bình luận liên tiếp cùng khách cùng bài (FR-148), 10–60 giây (migration 0072). */
    mergeWindowSeconds: integer('merge_window_seconds').notNull().default(30),
    /** Sau khi nhân viên trả lời trong chuỗi, AI chỉ gợi ý trong N phút (FR-154); 0 = tắt (migration 0072). */
    humanHoldMinutes: integer('human_hold_minutes').notNull().default(120),
    /** FR-167: số câu AI tối đa cho MỘT khách dưới MỘT bài trong 24 giờ (1–5, mặc định 3; migration 0076). */
    maxAiRepliesPerCustomerPost: integer('max_ai_replies_per_customer_post').notNull().default(3),
    /** Người Owner lưu lần cuối (null = hệ thống / người dùng đã bị xóa). Chỉ được là chính người ghi. */
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'automation_settings_threshold_check',
      sql`${t.threshold} >= 0.8 AND ${t.threshold} <= 1`,
    ),
    check('automation_settings_delay_check', sql`${t.delaySeconds} IN (0, 60, 120, 300)`),
    check('automation_settings_daily_cap_check', sql`${t.dailyCap} BETWEEN 1 AND 1000`),
    check(
      'automation_settings_active_hours_check',
      sql`${t.activeHours} IS NULL OR jsonb_typeof(${t.activeHours}) = 'object'`,
    ),
    check('automation_settings_merge_window_check', sql`${t.mergeWindowSeconds} BETWEEN 10 AND 60`),
    check('automation_settings_human_hold_check', sql`${t.humanHoldMinutes} >= 0`),
    check(
      'automation_settings_reply_cap_check',
      sql`${t.maxAiRepliesPerCustomerPost} BETWEEN 1 AND 5`,
    ),
    check('automation_settings_keywords_check', sql`cardinality(${t.blockedKeywords}) <= 50`),
    check(
      'automation_settings_signature_check',
      sql`${t.signature} IS NULL OR char_length(${t.signature}) BETWEEN 1 AND 120`,
    ),
  ],
);

/**
 * Mức Tắt/Chạy thử/Tự động của từng ô kênh × đối tượng × nhãn (FR-070). Không có dòng = Tắt. Nhãn chỉ gồm 3 nhãn
 * có ô (Khiếu nại/Spam không bao giờ tự gửi — CHECK chặn). Chỉ Owner (hoặc hệ thống) ghi.
 */
export const automationRules = cf.table(
  'automation_rules',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').notNull(),
    target: text('target').notNull(),
    label: text('label').notNull(),
    mode: text('mode').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'automation_rules_pk',
      columns: [t.workspaceId, t.channelId, t.target, t.label],
    }),
    foreignKey({
      name: 'automation_rules_channel_fk',
      columns: [t.workspaceId, t.channelId],
      foreignColumns: [channels.workspaceId, channels.id],
    }).onDelete('cascade'),
    check('automation_rules_target_check', sql`${t.target} IN ('comment', 'message')`),
    check('automation_rules_label_check', sql`${t.label} IN ('price', 'advice', 'purchase')`),
    check('automation_rules_mode_check', sql`${t.mode} IN ('off', 'shadow', 'auto')`),
  ],
);
