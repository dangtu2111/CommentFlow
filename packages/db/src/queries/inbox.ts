import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Truy vấn trang Bình luận (FR-040): tab theo trạng thái, lọc, tìm kiếm, sắp xếp, phân trang con trỏ. CHỈ ĐỌC.
 * Luôn gọi trong `withActor(workspaceId, userId, …)`: RLS giới hạn theo workspace + thành viên đang hoạt động; điều kiện
 * `workspace_id` tường minh ở đây là lớp phòng thủ thứ hai. `select` chỉ các cột `cf_app` đọc được (không token).
 */

export const INBOX_TABS = [
  'new',
  'pending_review',
  'scheduled_auto',
  'auto_replied',
  'needs_human',
  'needs_followup',
  'spam_suspected',
  'send_failed',
  'replied',
  'hidden',
  'skipped',
  'all',
] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export const INBOX_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
export type InboxPlatform = (typeof INBOX_PLATFORMS)[number];

/** Khóa phân trang: giá trị sắp xếp (timestamptz dạng chuỗi, giữ nguyên độ chính xác micro-giây) + id. */
export type InboxCursor = { createdTime: string; id: string };

export type InboxFilter = {
  tab: InboxTab;
  platform?: InboxPlatform;
  channelId?: string;
  /** Chỉ bình luận của bài quảng cáo (`posts.is_ad`). */
  adsOnly?: boolean;
  /** Tìm theo tên tác giả hoặc nội dung (không phân biệt hoa/thường và dấu). */
  search?: string;
  sort: 'oldest' | 'newest';
  cursor?: InboxCursor | null;
  limit?: number;
};

export type InboxItem = {
  id: string;
  status: string;
  text: string;
  authorName: string | null;
  authorExternalId: string;
  createdTime: Date | null;
  label: string | null;
  needsFollowup: boolean;
  channelId: string;
  channelName: string;
  platform: InboxPlatform;
  isAd: boolean;
  /** Tên người KHÁC đang giữ khóa mềm còn hạn (không phải chính người xem); `null` nếu không có. */
  lockedByName: string | null;
};

export type InboxPage = { items: InboxItem[]; nextCursor: InboxCursor | null };

export const DEFAULT_INBOX_LIMIT = 25;
export const MAX_INBOX_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;

/** Điều kiện của từng tab. `sending` gộp vào "Sẽ tự gửi"; "Mới" = `new` + `processing`. */
const TAB_PREDICATE: Record<InboxTab, SQL | null> = {
  new: sql`c.status IN ('new', 'processing')`,
  pending_review: sql`c.status = 'pending_review'`,
  scheduled_auto: sql`c.status IN ('scheduled_auto', 'sending')`,
  auto_replied: sql`c.status = 'auto_replied'`,
  needs_human: sql`c.status = 'needs_human'`,
  needs_followup: sql`(c.needs_followup AND c.status NOT IN ('replied', 'hidden', 'skipped'))`,
  spam_suspected: sql`c.status = 'spam_suspected'`,
  send_failed: sql`c.status = 'send_failed'`,
  replied: sql`c.status = 'replied'`,
  hidden: sql`c.status = 'hidden'`,
  skipped: sql`c.status = 'skipped'`,
  all: null,
};

/** Thoát `\`, `%`, `_` để chuỗi người dùng nhập luôn là ký tự thường trong LIKE. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const FROM = sql`
  FROM cf.comments c
  JOIN cf.channels ch ON ch.workspace_id = c.workspace_id AND ch.id = c.channel_id
  JOIN cf.posts p ON p.workspace_id = c.workspace_id AND p.id = c.post_id
  LEFT JOIN core.users lu ON lu.id = c.locked_by`;

const SORT_KEY = sql`COALESCE(c.created_time, c.created_at)`;

/** Bộ lọc dùng chung cho danh sách và đếm (không gồm tab, sắp xếp, con trỏ). */
function commonConditions(workspaceId: string, filter: InboxFilter): SQL[] {
  const conditions: SQL[] = [
    sql`c.workspace_id = ${workspaceId}::uuid`,
    sql`c.merged_into_id IS NULL`,
    // Khách đã xóa trên nền tảng (FR-048): ẩn khỏi inbox (vẫn giữ dòng + log).
    sql`c.deleted_at IS NULL`,
  ];
  if (filter.platform) conditions.push(sql`ch.platform = ${filter.platform}`);
  if (filter.channelId) conditions.push(sql`c.channel_id = ${filter.channelId}::uuid`);
  if (filter.adsOnly) conditions.push(sql`p.is_ad`);
  const search = filter.search?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    conditions.push(
      sql`(public.unaccent(c.text) ILIKE public.unaccent(${pattern}) ESCAPE '\\'
        OR public.unaccent(COALESCE(c.author_name, '')) ILIKE public.unaccent(${pattern}) ESCAPE '\\')`,
    );
  }
  return conditions;
}

const where = (conditions: SQL[]): SQL => sql`WHERE ${sql.join(conditions, sql` AND `)}`;

type Row = {
  id: string;
  status: string;
  text: string;
  author_name: string | null;
  author_external_id: string;
  created_time: Date | null;
  label: string | null;
  needs_followup: boolean;
  channel_id: string;
  channel_name: string;
  platform: InboxPlatform;
  is_ad: boolean;
  locked_by_name: string | null;
  sort_key: string;
};

export async function listComments(
  tx: Database,
  workspaceId: string,
  filter: InboxFilter,
  /** Người xem: khóa của chính họ không hiện như "người khác đang xử lý". */
  viewerId?: string,
): Promise<InboxPage> {
  const limit = clampLimit(filter.limit);
  const conditions = commonConditions(workspaceId, filter);
  const tabPredicate = TAB_PREDICATE[filter.tab];
  if (tabPredicate) conditions.push(tabPredicate);
  const oldest = filter.sort === 'oldest';
  if (filter.cursor) {
    const cursor = sql`(${filter.cursor.createdTime}::timestamptz, ${filter.cursor.id}::uuid)`;
    conditions.push(
      oldest ? sql`(${SORT_KEY}, c.id) > ${cursor}` : sql`(${SORT_KEY}, c.id) < ${cursor}`,
    );
  }
  const direction = oldest ? sql`ASC` : sql`DESC`;
  const result = await tx.execute<Row>(sql`
    SELECT c.id, c.status, c.text, c.author_name, c.author_external_id, c.created_time, c.label,
           c.needs_followup, c.channel_id, ch.name AS channel_name, ch.platform, p.is_ad,
           CASE WHEN c.locked_until > now() AND c.locked_by IS DISTINCT FROM ${viewerId ?? null}::uuid
                THEN lu.name END AS locked_by_name,
           (${SORT_KEY})::text AS sort_key
    ${FROM}
    ${where(conditions)}
    ORDER BY ${SORT_KEY} ${direction}, c.id ${direction}
    LIMIT ${limit + 1}`);
  const rows = result.rows;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toItem),
    nextCursor: rows.length > limit && last ? { createdTime: last.sort_key, id: last.id } : null,
  };
}

/** Số bình luận của MỌI tab trong một truy vấn, áp cùng bộ lọc nền tảng/kênh/quảng cáo/tìm kiếm. */
export async function countCommentsByTab(
  tx: Database,
  workspaceId: string,
  filter: InboxFilter,
): Promise<Record<InboxTab, number>> {
  const columns = INBOX_TABS.map((tab) => {
    const predicate = TAB_PREDICATE[tab];
    const alias = sql.raw(`"${tab}"`);
    return predicate
      ? sql`count(*) FILTER (WHERE ${predicate})::int AS ${alias}`
      : sql`count(*)::int AS ${alias}`;
  });
  const result = await tx.execute<Record<InboxTab, number>>(sql`
    SELECT ${sql.join(columns, sql`, `)}
    ${FROM}
    ${where(commonConditions(workspaceId, filter))}`);
  const row = result.rows[0];
  return Object.fromEntries(INBOX_TABS.map((tab) => [tab, Number(row?.[tab] ?? 0)])) as Record<
    InboxTab,
    number
  >;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_INBOX_LIMIT;
  return Math.min(MAX_INBOX_LIMIT, Math.max(1, Math.floor(limit)));
}

function toItem(row: Row): InboxItem {
  return {
    id: row.id,
    status: row.status,
    text: row.text,
    authorName: row.author_name,
    authorExternalId: row.author_external_id,
    createdTime: row.created_time,
    label: row.label,
    needsFollowup: row.needs_followup,
    channelId: row.channel_id,
    channelName: row.channel_name,
    platform: row.platform,
    isAd: row.is_ad,
    lockedByName: row.locked_by_name,
  };
}

export type InboxChannel = { id: string; name: string; platform: InboxPlatform };

/** Kênh của workspace để chọn trong bộ lọc (chỉ id/tên/nền tảng; không có cột token). */
export async function listInboxChannels(
  tx: Database,
  workspaceId: string,
): Promise<InboxChannel[]> {
  const result = await tx.execute<InboxChannel>(sql`
    SELECT ch.id, ch.name, ch.platform
      FROM cf.channels ch
     WHERE ch.workspace_id = ${workspaceId}::uuid
     ORDER BY ch.name, ch.id`);
  return result.rows;
}
