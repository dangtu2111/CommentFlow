import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Truy vấn trang Nhật ký (FR-092). CHỈ ĐỌC. Luôn gọi trong `withActor(workspaceId, userId, …)`.
 *
 * Quyền xem (FR-092): Owner thấy mọi dòng của workspace; Staff chỉ thấy dòng do CHÍNH MÌNH thực hiện
 * (`actor_type = 'user'` và `actor_id` = người xem) và dòng hệ thống do CHÍNH MÌNH yêu cầu (`actor_type = 'system'` và
 * `on_behalf_of` = người xem, migration 0029); KHÔNG thấy dòng AI, dòng của người khác, dòng hệ thống không có `on_behalf_of`.
 * Từ migration 0028/0029 RLS của `action_logs` cũng ép quy tắc này nên đây là lớp thứ hai — vẫn MỘT chỗ duy nhất (`viewerConditions`), áp cho cả danh sách, chi tiết và danh sách
 * hành động; bộ lọc người dùng nhập chỉ THU HẸP thêm, không bao giờ mở rộng.
 */

export const ACTION_LOG_ACTOR_TYPES = ['user', 'ai', 'system', 'admin'] as const;
export type ActionLogActorType = (typeof ACTION_LOG_ACTOR_TYPES)[number];

export type ActionLogViewer = { userId: string; role: 'owner' | 'staff' };

/** Khóa phân trang: `created_at` dạng chuỗi (giữ micro-giây) + id. Sắp xếp mới → cũ. */
export type ActionLogCursor = { createdAt: string; id: string };

export type ActionLogFilter = {
  actorType?: ActionLogActorType;
  /** Mã hành động chính xác, ví dụ `member.role_changed`. */
  action?: string;
  /** Ngày `YYYY-MM-DD` (gồm cả hai đầu) theo múi giờ workspace. */
  fromDate?: string;
  toDate?: string;
  cursor?: ActionLogCursor | null;
  limit?: number;
};

export type ActionLogItem = {
  id: string;
  createdAt: Date;
  actorType: ActionLogActorType;
  actorId: string | null;
  /** Tên người thực hiện (chỉ loại `user`, và chỉ khi còn là thành viên đang hoạt động); `null` nếu không có. */
  actorName: string | null;
  /** Người đã yêu cầu việc do hệ thống làm (chỉ dòng `system`); `null` nếu không có. */
  onBehalfOfId: string | null;
  /** Tên người yêu cầu (`null` nếu không có hoặc không còn trong `users`). */
  onBehalfOfName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
};

export type ActionLogDetail = ActionLogItem & {
  before: unknown;
  after: unknown;
  impersonationId: string | null;
};

export type ActionLogPage = { items: ActionLogItem[]; nextCursor: ActionLogCursor | null };

export const DEFAULT_ACTION_LOG_LIMIT = 25;
export const MAX_ACTION_LOG_LIMIT = 100;
export const MAX_ACTION_LENGTH = 100;
const MAX_ACTION_CHOICES = 200;

const FROM = sql`
  FROM core.action_logs l
  LEFT JOIN core.users u ON l.actor_type = 'user' AND u.id = l.actor_id
  LEFT JOIN core.users ob ON l.actor_type = 'system' AND ob.id = l.on_behalf_of`;

/** Quy tắc quyền xem (khớp policy `action_logs_select`): Owner không thêm điều kiện; Staff: dòng của mình + dòng hệ thống do mình yêu cầu. */
function viewerConditions(viewer: ActionLogViewer): SQL[] {
  if (viewer.role === 'owner') return [];
  return [
    sql`((l.actor_type = 'user' AND l.actor_id = ${viewer.userId}::uuid)
      OR (l.actor_type = 'system' AND l.on_behalf_of = ${viewer.userId}::uuid))`,
  ];
}

function baseConditions(workspaceId: string, viewer: ActionLogViewer): SQL[] {
  return [sql`l.workspace_id = ${workspaceId}::uuid`, ...viewerConditions(viewer)];
}

const where = (conditions: SQL[]): SQL => sql`WHERE ${sql.join(conditions, sql` AND `)}`;

type Row = {
  id: string;
  created_at: Date;
  created_key: string;
  actor_type: ActionLogActorType;
  actor_id: string | null;
  actor_name: string | null;
  on_behalf_of: string | null;
  on_behalf_of_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before?: unknown;
  after?: unknown;
  impersonation_id?: string | null;
};

const COLUMNS = sql`l.id, l.created_at, l.created_at::text AS created_key, l.actor_type, l.actor_id,
  u.name AS actor_name, l.on_behalf_of, ob.name AS on_behalf_of_name, l.action, l.target_type, l.target_id`;

function toItem(row: Row): ActionLogItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    onBehalfOfId: row.on_behalf_of,
    onBehalfOfName: row.on_behalf_of_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
  };
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_ACTION_LOG_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_ACTION_LOG_LIMIT);
}

export async function listActionLogs(
  tx: Database,
  workspaceId: string,
  viewer: ActionLogViewer,
  filter: ActionLogFilter,
  /** Múi giờ IANA của workspace, để hiểu "từ ngày/đến ngày". */
  timeZone: string,
): Promise<ActionLogPage> {
  const limit = clampLimit(filter.limit);
  const conditions = baseConditions(workspaceId, viewer);
  if (filter.actorType) conditions.push(sql`l.actor_type = ${filter.actorType}`);
  const action = filter.action?.trim().slice(0, MAX_ACTION_LENGTH);
  if (action) conditions.push(sql`l.action = ${action}`);
  if (filter.fromDate) {
    conditions.push(
      sql`l.created_at >= (${filter.fromDate}::date)::timestamp AT TIME ZONE ${timeZone}`,
    );
  }
  if (filter.toDate) {
    conditions.push(
      sql`l.created_at < ((${filter.toDate}::date + 1)::timestamp AT TIME ZONE ${timeZone})`,
    );
  }
  if (filter.cursor) {
    conditions.push(
      sql`(l.created_at, l.id) < (${filter.cursor.createdAt}::timestamptz, ${filter.cursor.id}::uuid)`,
    );
  }
  const result = await tx.execute<Row>(sql`
    SELECT ${COLUMNS}
    ${FROM}
    ${where(conditions)}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ${limit + 1}`);
  const rows = result.rows;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toItem),
    nextCursor: rows.length > limit && last ? { createdAt: last.created_key, id: last.id } : null,
  };
}

/** Một dòng nhật ký kèm trước/sau; `null` nếu không có hoặc người xem không có quyền thấy (không phân biệt hai ca). */
export async function getActionLog(
  tx: Database,
  workspaceId: string,
  viewer: ActionLogViewer,
  id: string,
): Promise<ActionLogDetail | null> {
  const conditions = [...baseConditions(workspaceId, viewer), sql`l.id = ${id}::uuid`];
  const result = await tx.execute<Row>(sql`
    SELECT ${COLUMNS}, l.before, l.after, l.impersonation_id
    ${FROM}
    ${where(conditions)}`);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...toItem(row),
    before: row.before ?? null,
    after: row.after ?? null,
    impersonationId: row.impersonation_id ?? null,
  };
}

/** Các mã hành động người xem được thấy (cho ô lọc), tối đa `MAX_ACTION_CHOICES`. */
export async function listActionLogActions(
  tx: Database,
  workspaceId: string,
  viewer: ActionLogViewer,
): Promise<string[]> {
  const result = await tx.execute<{ action: string }>(sql`
    SELECT DISTINCT l.action
    FROM core.action_logs l
    ${where(baseConditions(workspaceId, viewer))}
    ORDER BY l.action
    LIMIT ${MAX_ACTION_CHOICES}`);
  return result.rows.map((r) => r.action);
}
