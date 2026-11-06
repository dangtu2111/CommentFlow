import { z } from 'zod';
import { maskPii } from './pii';

/**
 * Xuất dữ liệu workspace (FR-094, US-071, Q-EXP1). Logic thuần: hằng số, schema job và dựng từng dòng tệp xuất.
 * Mọi văn bản tự do đi qua `maskPii`; không có tên khách; id người dùng nền tảng thay bằng mã giả; liên hệ khách
 * chỉ còn 4 số cuối + cờ có email (nguyên tắc bất biến #6).
 */

/** Hàng đợi pg-boss `data-export` (docs/09 §9 gộp trong `privacy`). */
export const DATA_EXPORT_QUEUE = 'data-export';

/** Tệp xuất hết hạn sau 7 ngày kể từ lúc yêu cầu hoàn tất. */
export const DATA_EXPORT_TTL_DAYS = 7;

/** Trần số bản ghi mỗi phần; vượt thì cắt và ghi `truncated` ở dòng tổng kết. */
export const DATA_EXPORT_MAX_ROWS_PER_SECTION = 100_000;

/** Số bản ghi đọc mỗi trang (phân trang theo khóa `id`). */
export const DATA_EXPORT_PAGE_SIZE = 500;

/** Tối đa số yêu cầu xuất trong 24 giờ của một workspace. */
export const DATA_EXPORT_DAILY_LIMIT = 5;

export const DATA_EXPORT_SECTIONS = [
  'comments',
  'leads',
  'kb_chunks',
  'automation_settings',
  'rules',
] as const;
export type DataExportSection = (typeof DATA_EXPORT_SECTIONS)[number];

/** Dữ liệu job: chỉ id (không có nội dung); worker kiểm lại người yêu cầu là Owner đang hoạt động. */
export const dataExportJobSchema = z.object({
  workspaceId: z.uuid(),
  exportId: z.uuid(),
  requestedBy: z.uuid(),
});
export type DataExportJob = z.infer<typeof dataExportJobSchema>;

/** Khóa tệp trong kho; chỉ chứa id nội bộ. */
export function exportFileKey(workspaceId: string, exportId: string): string {
  return `exports/${workspaceId}/${exportId}.jsonl`;
}

export function exportExpiresAt(now: Date): Date {
  return new Date(now.getTime() + DATA_EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Một dòng JSON Lines: `{"section":…,"row":…}` kết thúc bằng xuống dòng (JSON.stringify đã thoát ký tự xuống dòng). */
export function exportLine(section: DataExportSection | 'meta' | 'summary', row: object): string {
  return `${JSON.stringify({ section, row })}\n`;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const mask = (s: string | null): string | null => (s === null ? null : maskPii(s));

export type CommentExportSource = {
  id: string;
  channelId: string;
  postId: string;
  externalId: string;
  authorExternalId: string;
  text: string;
  lang: string | null;
  createdTime: Date | null;
  label: string | null;
  status: string;
  isHidden: boolean;
  isOwn: boolean;
  repliedAt: Date | null;
  deletedAt: Date | null;
};

export function shapeCommentRow(row: CommentExportSource, pseudonym: (value: string) => string) {
  return {
    id: row.id,
    channel_id: row.channelId,
    post_id: row.postId,
    external_id: row.externalId,
    author: pseudonym(row.authorExternalId),
    text: maskPii(row.text),
    lang: row.lang,
    created_time: iso(row.createdTime),
    label: row.label,
    status: row.status,
    is_hidden: row.isHidden,
    is_own: row.isOwn,
    replied_at: iso(row.repliedAt),
    deleted: row.deletedAt !== null,
  };
}

export type LeadExportSource = {
  id: string;
  channelId: string;
  sourceType: string;
  stage: string;
  phoneLast4: string | null;
  hasEmail: boolean;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function shapeLeadRow(row: LeadExportSource) {
  return {
    id: row.id,
    channel_id: row.channelId,
    source_type: row.sourceType,
    stage: row.stage,
    phone_masked: row.phoneLast4 === null ? null : `***${row.phoneLast4}`,
    has_email: row.hasEmail,
    note: mask(row.note),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export type KbChunkExportSource = {
  id: string;
  sourceId: string;
  versionId: string | null;
  content: string;
  lang: string;
  isDraft: boolean;
  updatedAt: Date;
};

export function shapeKbChunkRow(row: KbChunkExportSource) {
  return {
    id: row.id,
    source_id: row.sourceId,
    version_id: row.versionId,
    content: maskPii(row.content),
    lang: row.lang,
    is_draft: row.isDraft,
    updated_at: row.updatedAt.toISOString(),
  };
}

export type AutomationSettingsExportSource = {
  delaySeconds: number;
  dailyCap: number;
  activeHours: unknown;
  blockedKeywords: string[];
  signature: string | null;
};

export function shapeAutomationSettingsRow(row: AutomationSettingsExportSource) {
  return {
    delay_seconds: row.delaySeconds,
    daily_cap: row.dailyCap,
    active_hours: row.activeHours,
    blocked_keywords: row.blockedKeywords.map((k) => maskPii(k)),
    signature: mask(row.signature),
  };
}

export type RuleExportSource = {
  id: string;
  name: string;
  type: string;
  pattern: string;
  action: string;
  enabled: boolean;
};

export function shapeRuleRow(row: RuleExportSource) {
  return {
    id: row.id,
    name: maskPii(row.name),
    type: row.type,
    pattern: maskPii(row.pattern),
    action: row.action,
    enabled: row.enabled,
  };
}
