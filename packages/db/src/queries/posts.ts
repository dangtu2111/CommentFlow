import { type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { escapeLikePattern, INBOX_PLATFORMS, type InboxPlatform, MAX_SEARCH_LENGTH } from './inbox';

/**
 * Truy vấn trang Bài viết (FR-060): lọc nền tảng/kênh/loại, tìm kiếm, sắp xếp, phân trang theo số trang. CHỈ ĐỌC.
 * Gọi trong `withActor(workspaceId, userId, …)`: RLS giới hạn theo workspace + thành viên; điều kiện `workspace_id`
 * tường minh là lớp phòng thủ thứ hai. Bộ lọc "đã gắn / chưa gắn sản phẩm" chờ bảng `post_products` (POSTS-LIST-LINK-FILTER).
 */
export const POSTS_PLATFORMS = INBOX_PLATFORMS;
export type PostsPlatform = InboxPlatform;
export const POSTS_KINDS = ['ads', 'organic'] as const;
export type PostsKind = (typeof POSTS_KINDS)[number];
export const POSTS_SORTS = ['pending', 'newest'] as const;
export type PostsSort = (typeof POSTS_SORTS)[number];

export const DEFAULT_POSTS_LIMIT = 20;
export const MAX_POSTS_LIMIT = 100;

export type PostsFilter = {
  platform?: PostsPlatform;
  channelId?: string;
  kind?: PostsKind;
  /** Tìm theo nội dung hoặc mã bài của nền tảng (không phân biệt hoa/thường và dấu). */
  search?: string;
  sort: PostsSort;
  /** Số trang, từ 1. */
  page: number;
  limit?: number;
};

export type PostListItem = {
  id: string;
  channelId: string;
  channelName: string;
  platform: PostsPlatform;
  externalId: string;
  message: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  isAd: boolean;
  createdTime: Date | null;
  commentCount: number;
  pendingCount: number;
};

export type PostsPage = { items: PostListItem[]; total: number };

const FROM = sql`
  FROM cf.posts p
  JOIN cf.channels ch ON ch.workspace_id = p.workspace_id AND ch.id = p.channel_id`;

function conditions(workspaceId: string, filter: PostsFilter): SQL[] {
  const result: SQL[] = [sql`p.workspace_id = ${workspaceId}::uuid`];
  if (filter.platform) result.push(sql`ch.platform = ${filter.platform}`);
  if (filter.channelId) result.push(sql`p.channel_id = ${filter.channelId}::uuid`);
  if (filter.kind === 'ads') result.push(sql`p.is_ad`);
  if (filter.kind === 'organic') result.push(sql`NOT p.is_ad`);
  const search = filter.search?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    result.push(
      sql`(public.unaccent(COALESCE(p.message, '')) ILIKE public.unaccent(${pattern}) ESCAPE '\\'
        OR p.external_id ILIKE ${pattern} ESCAPE '\\')`,
    );
  }
  return result;
}

type Row = {
  id: string;
  channel_id: string;
  channel_name: string;
  platform: PostsPlatform;
  external_id: string;
  message: string | null;
  permalink: string | null;
  media_url: string | null;
  is_ad: boolean;
  created_time: Date | null;
  comment_count: number;
  pending_count: number;
};

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

export async function listPosts(
  tx: Database,
  workspaceId: string,
  filter: PostsFilter,
): Promise<PostsPage> {
  const limit = clamp(filter.limit, DEFAULT_POSTS_LIMIT, MAX_POSTS_LIMIT);
  const page = clamp(filter.page, 1, 100_000);
  const where = sql`WHERE ${sql.join(conditions(workspaceId, filter), sql` AND `)}`;
  // Hòa nhau → bài mới hơn trước, rồi id để thứ tự ổn định giữa các trang. `NULLS LAST`: bài chưa có giờ đăng xuống cuối.
  const order =
    filter.sort === 'pending'
      ? sql`p.pending_count DESC, p.created_time DESC NULLS LAST, p.id DESC`
      : sql`p.created_time DESC NULLS LAST, p.id DESC`;
  const [rows, count] = await Promise.all([
    tx.execute<Row>(sql`
      SELECT p.id, p.channel_id, ch.name AS channel_name, ch.platform, p.external_id, p.message, p.permalink,
             p.media_url, p.is_ad, p.created_time, p.comment_count, p.pending_count
      ${FROM}
      ${where}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
    tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n ${FROM} ${where}`),
  ]);
  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      platform: row.platform,
      externalId: row.external_id,
      message: row.message,
      permalink: row.permalink,
      mediaUrl: row.media_url,
      isAd: row.is_ad,
      createdTime: row.created_time,
      commentCount: row.comment_count,
      pendingCount: row.pending_count,
    })),
    total: Number(count.rows[0]?.n ?? 0),
  };
}
