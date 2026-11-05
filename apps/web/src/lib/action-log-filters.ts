import { z } from 'zod';

/**
 * Tham số URL của trang Nhật ký (FR-092). Thuần, không phụ thuộc DB: Zod kiểm mọi giá trị; giá trị lạ → bỏ qua.
 * Hằng số khai báo lại (cùng giá trị với `@flow/db`) để thành phần React không kéo mã truy cập DB vào bundle.
 */
export const ACTIVITY_ACTOR_KEYS = ['user', 'ai', 'system', 'admin'] as const;
export type ActivityActorKey = (typeof ACTIVITY_ACTOR_KEYS)[number];

export const ACTIVITY_BASE_PATH = '/app/activity';
export const ACTIVITY_ACTION_MAX = 100;

export type ActivityCursorValue = { createdAt: string; id: string };

export type ActivityView = {
  actorType?: ActivityActorKey;
  action?: string;
  /** `YYYY-MM-DD`, theo múi giờ workspace. */
  fromDate?: string;
  toDate?: string;
  /** Dòng đang mở ở cột chi tiết (tham số `l`, UUID). */
  selected?: string;
  cursor: ActivityCursorValue | null;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const cursorSchema = z.object({ t: z.string().regex(TIMESTAMP), i: z.uuid() });

/** Ngày có thật (loại 2026-02-30). */
function validDate(raw: string | undefined): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(raw) ? raw : undefined;
}

export function encodeActivityCursor(cursor: ActivityCursorValue): string {
  return Buffer.from(JSON.stringify({ t: cursor.createdAt, i: cursor.id })).toString('base64url');
}

function decodeCursor(raw: string | undefined): ActivityCursorValue | null {
  if (!raw || raw.length > 200) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return parsed.success ? { createdAt: parsed.data.t, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}

export function parseActivitySearchParams(params: RawParams): ActivityView {
  const actor = z.enum(ACTIVITY_ACTOR_KEYS).safeParse(first(params.actor));
  const selected = z.uuid().safeParse(first(params.l));
  const rawAction = first(params.action)?.trim();
  const action =
    rawAction && rawAction.length <= ACTIVITY_ACTION_MAX && /^[\w.:-]+$/.test(rawAction)
      ? rawAction
      : undefined;
  const fromDate = validDate(first(params.from));
  const toDate = validDate(first(params.to));
  return {
    ...(actor.success ? { actorType: actor.data } : {}),
    ...(action ? { action } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(selected.success ? { selected: selected.data } : {}),
    cursor: decodeCursor(first(params.cursor)),
  };
}

/** Dựng URL từ một `view` (+ ghi đè; giá trị `undefined` xóa bộ lọc). */
export function buildActivityHref(
  view: Partial<ActivityView>,
  overrides: Partial<ActivityView> = {},
): string {
  const merged = { ...view, ...overrides };
  const params = new URLSearchParams();
  if (merged.actorType) params.set('actor', merged.actorType);
  if (merged.action) params.set('action', merged.action);
  if (merged.fromDate) params.set('from', merged.fromDate);
  if (merged.toDate) params.set('to', merged.toDate);
  if (merged.cursor) params.set('cursor', encodeActivityCursor(merged.cursor));
  if (merged.selected) params.set('l', merged.selected);
  const query = params.toString();
  return query ? `${ACTIVITY_BASE_PATH}?${query}` : ACTIVITY_BASE_PATH;
}
