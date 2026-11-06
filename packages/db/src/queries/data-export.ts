import type {
  AutomationSettingsExportSource,
  CommentExportSource,
  KbChunkExportSource,
  LeadExportSource,
  RuleExportSource,
} from '@flow/shared';
import { DATA_EXPORT_DAILY_LIMIT } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Yêu cầu xuất dữ liệu workspace (FR-094, migration 0055, Q-EXP1). Tạo yêu cầu: `withActor` (Owner; RLS chỉ cho INSERT
 * hai cột). Chuyển trạng thái + đọc dữ liệu để xuất: `withJob` (hệ thống). Lớp này KHÔNG giải mã liên hệ khách.
 */
export type DataExportStatus = 'pending' | 'running' | 'ready' | 'failed' | 'expired';

export type DataExportRow = {
  id: string;
  status: DataExportStatus;
  sizeBytes: number | null;
  rowCounts: Record<string, number> | null;
  errorCode: string | null;
  readyAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

type RawExport = {
  id: string;
  status: DataExportStatus;
  size_bytes: string | number | null;
  row_counts: Record<string, number> | null;
  error_code: string | null;
  ready_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string;
};

const toDate = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

const toExportRow = (x: RawExport): DataExportRow => ({
  id: x.id,
  status: x.status,
  sizeBytes: x.size_bytes === null ? null : Number(x.size_bytes),
  rowCounts: x.row_counts,
  errorCode: x.error_code,
  readyAt: toDate(x.ready_at),
  expiresAt: toDate(x.expires_at),
  createdAt: new Date(x.created_at),
});

export type RequestExportResult =
  | { outcome: 'created'; id: string }
  | { outcome: 'already_active' }
  | { outcome: 'rate_limited' };

/** Giới hạn: một yêu cầu đang hoạt động/workspace (chỉ mục duy nhất) và ≤ 5 yêu cầu/24 giờ. */
export async function requestDataExport(
  tx: Database,
  workspaceId: string,
  requestedBy: string,
): Promise<RequestExportResult> {
  // Khóa tư vấn nối đuôi hai yêu cầu đồng thời của cùng workspace (không đụng chỉ mục duy nhất).
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`data-export:${workspaceId}`}))`);
  const active = await tx.execute(sql`
    SELECT 1 FROM core.data_exports
    WHERE workspace_id = ${workspaceId}::uuid AND status IN ('pending', 'running')`);
  if (active.rows.length > 0) return { outcome: 'already_active' };
  const recent = await tx.execute<{ n: string | number }>(sql`
    SELECT count(*) AS n FROM core.data_exports
    WHERE workspace_id = ${workspaceId}::uuid AND created_at > now() - interval '24 hours'`);
  if (Number(recent.rows[0]?.n ?? 0) >= DATA_EXPORT_DAILY_LIMIT) return { outcome: 'rate_limited' };
  const inserted = await tx.execute<{ id: string }>(sql`
    INSERT INTO core.data_exports (workspace_id, requested_by)
    VALUES (${workspaceId}::uuid, ${requestedBy}::uuid)
    RETURNING id`);
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('data_export_insert_failed');
  return { outcome: 'created', id };
}

export async function listDataExports(
  tx: Database,
  workspaceId: string,
  limit = 20,
): Promise<DataExportRow[]> {
  const r = await tx.execute<RawExport>(sql`
    SELECT id, status, size_bytes, row_counts, error_code, ready_at, expires_at, created_at
    FROM core.data_exports
    WHERE workspace_id = ${workspaceId}::uuid
    ORDER BY created_at DESC LIMIT ${limit}::integer`);
  return r.rows.map(toExportRow);
}

/** pending → running (hệ thống). Trả false nếu yêu cầu không còn `pending` (đã chạy/không tồn tại): job chạy lại bỏ qua. */
export async function claimDataExport(
  tx: Database,
  workspaceId: string,
  exportId: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE core.data_exports SET status = 'running', updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${exportId}::uuid AND status = 'pending'
    RETURNING id`);
  return r.rows.length > 0;
}

export async function completeDataExport(
  tx: Database,
  workspaceId: string,
  exportId: string,
  input: {
    fileKey: string;
    sizeBytes: number;
    rowCounts: Record<string, number>;
    expiresAt: Date;
  },
): Promise<void> {
  await tx.execute(sql`
    UPDATE core.data_exports
    SET status = 'ready', file_key = ${input.fileKey}, size_bytes = ${input.sizeBytes}::bigint,
        row_counts = ${JSON.stringify(input.rowCounts)}::jsonb, ready_at = now(),
        expires_at = ${input.expiresAt.toISOString()}::timestamptz, error_code = NULL, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${exportId}::uuid AND status = 'running'`);
}

/** `errorCode` là mã ngắn cố định (không chứa thông điệp lỗi gốc, tránh lọt PII). */
export async function failDataExport(
  tx: Database,
  workspaceId: string,
  exportId: string,
  errorCode: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE core.data_exports SET status = 'failed', error_code = ${errorCode}, updated_at = now()
    WHERE workspace_id = ${workspaceId}::uuid AND id = ${exportId}::uuid AND status IN ('pending', 'running')`);
}

/**
 * Yêu cầu kẹt (pending/running quá `staleMinutes` phút, ví dụ worker chết giữa chừng) → `failed` mã `timeout` để
 * Owner yêu cầu lại được (chỉ mục duy nhất chặn khi còn yêu cầu hoạt động). Hệ thống, ngữ cảnh trần; trả số dòng đổi.
 */
export async function failStaleDataExports(tx: Database, staleMinutes = 60): Promise<number> {
  const r = await tx.execute(sql`
    UPDATE core.data_exports SET status = 'failed', error_code = 'timeout', updated_at = now()
    WHERE status IN ('pending', 'running')
      AND updated_at < now() - make_interval(mins => ${staleMinutes}::integer)
    RETURNING id`);
  return r.rows.length;
}

export type ExpiredExport = { id: string; workspaceId: string; fileKey: string };

/**
 * Đánh dấu `expired` các yêu cầu `ready` quá hạn (hệ thống, ngữ cảnh trần) và trả khóa tệp để nơi gọi xóa khỏi kho.
 * Tối đa `limit` dòng/lần; idempotent.
 */
export async function expireDataExports(tx: Database, limit = 200): Promise<ExpiredExport[]> {
  const r = await tx.execute<{ id: string; workspace_id: string; file_key: string | null }>(sql`
    UPDATE core.data_exports SET status = 'expired', updated_at = now()
    WHERE id IN (
      SELECT id FROM core.data_exports WHERE status = 'ready' AND expires_at <= now()
      ORDER BY expires_at LIMIT ${limit}::integer FOR UPDATE SKIP LOCKED)
    RETURNING id, workspace_id, file_key`);
  return r.rows.flatMap((x) =>
    x.file_key ? [{ id: x.id, workspaceId: x.workspace_id, fileKey: x.file_key }] : [],
  );
}

/** Đọc từng trang theo khóa `id` (keyset) — không OFFSET, ổn định khi dữ liệu đang thay đổi. */
type Page<T> = { rows: T[]; lastId: string | null };

const pageOf = <R extends { id: string }, T>(rows: R[], map: (r: R) => T): Page<T> => ({
  rows: rows.map(map),
  lastId: rows.at(-1)?.id ?? null,
});

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export async function readCommentsPage(
  tx: Database,
  workspaceId: string,
  afterId: string | null,
  limit: number,
): Promise<Page<CommentExportSource>> {
  const r = await tx.execute<{
    id: string;
    channel_id: string;
    post_id: string;
    external_id: string;
    author_external_id: string;
    text: string;
    lang: string | null;
    created_time: Date | string | null;
    label: string | null;
    status: string;
    is_hidden: boolean;
    is_own: boolean;
    replied_at: Date | string | null;
    deleted_at: Date | string | null;
  }>(sql`
    SELECT id, channel_id, post_id, external_id, author_external_id, text, lang, created_time, label, status,
           is_hidden, is_own, replied_at, deleted_at
    FROM cf.comments
    WHERE workspace_id = ${workspaceId}::uuid AND id > ${afterId ?? ZERO_UUID}::uuid
    ORDER BY id LIMIT ${limit}::integer`);
  return pageOf(r.rows, (x) => ({
    id: x.id,
    channelId: x.channel_id,
    postId: x.post_id,
    externalId: x.external_id,
    authorExternalId: x.author_external_id,
    text: x.text,
    lang: x.lang,
    createdTime: toDate(x.created_time),
    label: x.label,
    status: x.status,
    isHidden: x.is_hidden,
    isOwn: x.is_own,
    repliedAt: toDate(x.replied_at),
    deletedAt: toDate(x.deleted_at),
  }));
}

/** Chỉ đọc `phone_last4` và cờ có email — KHÔNG đọc cột `*_enc`/`*_hash`, không đọc `name`. */
export async function readLeadsPage(
  tx: Database,
  workspaceId: string,
  afterId: string | null,
  limit: number,
): Promise<Page<LeadExportSource>> {
  const r = await tx.execute<{
    id: string;
    channel_id: string;
    source_type: string;
    stage: string;
    phone_last4: string | null;
    has_email: boolean;
    note: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(sql`
    SELECT id, channel_id, source_type, stage, phone_last4, (email_enc IS NOT NULL) AS has_email, note,
           created_at, updated_at
    FROM cf.leads
    WHERE workspace_id = ${workspaceId}::uuid AND id > ${afterId ?? ZERO_UUID}::uuid
    ORDER BY id LIMIT ${limit}::integer`);
  return pageOf(r.rows, (x) => ({
    id: x.id,
    channelId: x.channel_id,
    sourceType: x.source_type,
    stage: x.stage,
    phoneLast4: x.phone_last4,
    hasEmail: x.has_email,
    note: x.note,
    createdAt: new Date(x.created_at),
    updatedAt: new Date(x.updated_at),
  }));
}

export async function readKbChunksPage(
  tx: Database,
  workspaceId: string,
  afterId: string | null,
  limit: number,
): Promise<Page<KbChunkExportSource>> {
  const r = await tx.execute<{
    id: string;
    source_id: string;
    version_id: string | null;
    content: string;
    lang: string;
    is_draft: boolean;
    updated_at: Date | string;
  }>(sql`
    SELECT id, source_id, version_id, content, lang, is_draft, updated_at
    FROM cf.kb_chunks
    WHERE workspace_id = ${workspaceId}::uuid AND id > ${afterId ?? ZERO_UUID}::uuid
    ORDER BY id LIMIT ${limit}::integer`);
  return pageOf(r.rows, (x) => ({
    id: x.id,
    sourceId: x.source_id,
    versionId: x.version_id,
    content: x.content,
    lang: x.lang,
    isDraft: x.is_draft,
    updatedAt: new Date(x.updated_at),
  }));
}

export async function readRulesPage(
  tx: Database,
  workspaceId: string,
  afterId: string | null,
  limit: number,
): Promise<Page<RuleExportSource>> {
  const r = await tx.execute<RuleExportSource & { id: string }>(sql`
    SELECT id, name, type, pattern, action, enabled
    FROM cf.rules
    WHERE workspace_id = ${workspaceId}::uuid AND id > ${afterId ?? ZERO_UUID}::uuid
    ORDER BY id LIMIT ${limit}::integer`);
  return pageOf(r.rows, (x) => x);
}

export async function readAutomationSettings(
  tx: Database,
  workspaceId: string,
): Promise<AutomationSettingsExportSource | null> {
  const r = await tx.execute<{
    delay_seconds: number;
    daily_cap: number;
    active_hours: unknown;
    blocked_keywords: string[];
    signature: string | null;
  }>(sql`
    SELECT delay_seconds, daily_cap, active_hours, blocked_keywords, signature
    FROM cf.automation_settings WHERE workspace_id = ${workspaceId}::uuid`);
  const x = r.rows[0];
  if (!x) return null;
  return {
    delaySeconds: x.delay_seconds,
    dailyCap: x.daily_cap,
    activeHours: x.active_hours,
    blockedKeywords: x.blocked_keywords,
    signature: x.signature,
  };
}
