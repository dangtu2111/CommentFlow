import { z } from 'zod';

/**
 * Tham số URL của trang Bài viết (FR-060). Thuần: Zod kiểm mọi giá trị; giá trị lạ → bỏ qua, dùng mặc định.
 * Hằng số khai báo lại (cùng giá trị với `@flow/db`) để thành phần React không kéo mã DB vào bundle trình duyệt.
 */
export const POSTS_PLATFORM_KEYS = ['facebook', 'instagram', 'tiktok'] as const;
export type PostsPlatformKey = (typeof POSTS_PLATFORM_KEYS)[number];
export const POSTS_KIND_KEYS = ['ads', 'organic'] as const;
export type PostsKindKey = (typeof POSTS_KIND_KEYS)[number];
export const POSTS_SORT_KEYS = ['pending', 'newest'] as const;
export type PostsSortKey = (typeof POSTS_SORT_KEYS)[number];

export const POSTS_BASE_PATH = '/app/posts';
export const POSTS_SEARCH_MAX = 100;
export const POSTS_PAGE_SIZE = 20;
const MAX_PAGE = 1000;

export type PostsView = {
  platform?: PostsPlatformKey;
  channelId?: string;
  kind?: PostsKindKey;
  search?: string;
  sort: PostsSortKey;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function parsePostsSearchParams(params: RawParams): PostsView {
  const platform = z.enum(POSTS_PLATFORM_KEYS).safeParse(first(params.platform));
  const channel = z.uuid().safeParse(first(params.channel));
  const kind = z.enum(POSTS_KIND_KEYS).safeParse(first(params.kind));
  const sort = z.enum(POSTS_SORT_KEYS).safeParse(first(params.sort));
  const rawPage = Number.parseInt(first(params.page) ?? '', 10);
  const search = first(params.q)?.trim().slice(0, POSTS_SEARCH_MAX);
  return {
    ...(platform.success ? { platform: platform.data } : {}),
    ...(channel.success ? { channelId: channel.data } : {}),
    ...(kind.success ? { kind: kind.data } : {}),
    ...(search ? { search } : {}),
    sort: sort.success ? sort.data : 'pending',
    page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(rawPage, MAX_PAGE) : 1,
  };
}

/** Dựng URL từ `view` (+ ghi đè); bỏ tham số bằng giá trị mặc định. */
export function buildPostsHref(view: PostsView, overrides: Partial<PostsView> = {}): string {
  const merged = { ...view, ...overrides };
  const params = new URLSearchParams();
  if (merged.platform) params.set('platform', merged.platform);
  if (merged.channelId) params.set('channel', merged.channelId);
  if (merged.kind) params.set('kind', merged.kind);
  if (merged.search) params.set('q', merged.search);
  if (merged.sort !== 'pending') params.set('sort', merged.sort);
  if (merged.page > 1) params.set('page', String(merged.page));
  const query = params.toString();
  return query ? `${POSTS_BASE_PATH}?${query}` : POSTS_BASE_PATH;
}

export function postsPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
