import { z } from 'zod';

/**
 * Tham số URL của trang Bình luận (FR-040). Thuần, không phụ thuộc DB: Zod kiểm mọi giá trị; giá trị lạ → bỏ qua và
 * dùng mặc định (người dùng sửa URL tay không gây lỗi). Hằng số tab/nền tảng khai báo lại ở đây (cùng giá trị với
 * `@flow/db`) để thành phần React không kéo mã truy cập DB vào bundle trình duyệt; test khớp hai bên nằm ở trang.
 */
export const INBOX_TAB_KEYS = [
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
export type InboxTabKey = (typeof INBOX_TAB_KEYS)[number];
export const INBOX_PLATFORM_KEYS = ['facebook', 'instagram', 'tiktok'] as const;
export type InboxPlatformKey = (typeof INBOX_PLATFORM_KEYS)[number];

export const DEFAULT_INBOX_TAB: InboxTabKey = 'pending_review';
export const INBOX_SEARCH_MAX = 100;
export const INBOX_BASE_PATH = '/app/comments';

export type InboxCursorValue = { createdTime: string; id: string };

export type InboxView = {
  tab: InboxTabKey;
  platform?: InboxPlatformKey;
  channelId?: string;
  adsOnly?: boolean;
  search?: string;
  sort: 'oldest' | 'newest';
  cursor: InboxCursorValue | null;
  /** Bình luận đang mở ở cột chi tiết (tham số `c`, UUID). */
  selected?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

// timestamptz dạng chuỗi của Postgres (giữ micro-giây), ví dụ `2026-11-01 08:02:00.123456+00`.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const cursorSchema = z.object({ t: z.string().regex(TIMESTAMP), i: z.uuid() });

export function encodeInboxCursor(cursor: InboxCursorValue): string {
  return Buffer.from(JSON.stringify({ t: cursor.createdTime, i: cursor.id })).toString('base64url');
}

function decodeCursor(raw: string | undefined): InboxCursorValue | null {
  if (!raw || raw.length > 200) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return parsed.success ? { createdTime: parsed.data.t, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}

export function parseInboxSearchParams(params: RawParams): InboxView {
  const tab = z.enum(INBOX_TAB_KEYS).safeParse(first(params.tab));
  const platform = z.enum(INBOX_PLATFORM_KEYS).safeParse(first(params.platform));
  const channel = z.uuid().safeParse(first(params.channel));
  const sort = z.enum(['oldest', 'newest']).safeParse(first(params.sort));
  const selected = z.uuid().safeParse(first(params.c));
  const search = first(params.q)?.trim().slice(0, INBOX_SEARCH_MAX);
  return {
    tab: tab.success ? tab.data : DEFAULT_INBOX_TAB,
    ...(platform.success ? { platform: platform.data } : {}),
    ...(channel.success ? { channelId: channel.data } : {}),
    ...(first(params.ads) === '1' ? { adsOnly: true } : {}),
    ...(search ? { search } : {}),
    sort: sort.success ? sort.data : 'oldest',
    cursor: decodeCursor(first(params.cursor)),
    ...(selected.success ? { selected: selected.data } : {}),
  };
}

/** Dựng URL từ một `view` (+ ghi đè; giá trị `undefined` xóa bộ lọc). Bỏ tham số bằng giá trị mặc định. */
export function buildInboxHref(
  view: Partial<InboxView>,
  overrides: Partial<InboxView> = {},
): string {
  const merged = { ...view, ...overrides };
  const params = new URLSearchParams();
  if (merged.tab && merged.tab !== DEFAULT_INBOX_TAB) params.set('tab', merged.tab);
  if (merged.platform) params.set('platform', merged.platform);
  if (merged.channelId) params.set('channel', merged.channelId);
  if (merged.adsOnly) params.set('ads', '1');
  if (merged.search) params.set('q', merged.search);
  if (merged.sort && merged.sort !== 'oldest') params.set('sort', merged.sort);
  if (merged.cursor) params.set('cursor', encodeInboxCursor(merged.cursor));
  if (merged.selected) params.set('c', merged.selected);
  const query = params.toString();
  return query ? `${INBOX_BASE_PATH}?${query}` : INBOX_BASE_PATH;
}
