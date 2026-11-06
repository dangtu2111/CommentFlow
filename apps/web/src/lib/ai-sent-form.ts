import type { HistoryQuery } from '@flow/ai';

/**
 * Trang "AI đã gửi" (FR-075): phần thuần — đọc bộ lọc/trang từ URL và kiểm form Đánh dấu sai. Không phụ thuộc
 * React/DB để test được.
 */
export const AI_SENT_PAGE_SIZE = 25;
const MAX_PAGE = 1000;
export const AI_SENT_STATUS_FILTERS = ['all', 'sent', 'marked_wrong'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Giá trị lạ/mảng bị bỏ: mặc định mọi trạng thái, trang 1. */
export function parseAiSentFilter(
  params: Record<string, string | string[] | undefined>,
): HistoryQuery {
  const status = AI_SENT_STATUS_FILTERS.find((s) => s === params.status) ?? 'all';
  const raw = typeof params.page === 'string' ? Number(params.page) : 1;
  const page = Number.isInteger(raw) && raw >= 1 && raw <= MAX_PAGE ? raw : 1;
  return { status, limit: AI_SENT_PAGE_SIZE, offset: (page - 1) * AI_SENT_PAGE_SIZE };
}

export type MarkWrongFormResult =
  | { ok: true; id: string; reason: string | null }
  | { ok: false; code: 'bad_request' };

/** `bad_request` (id thiếu/không phải uuid) → nơi gọi trả 404. Việc kiểm lý do (độ dài) do quy tắc lõi làm. */
export function parseMarkWrongForm(data: { get(key: string): unknown }): MarkWrongFormResult {
  const id = data.get('id');
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, code: 'bad_request' };
  const reason = data.get('reason');
  return { ok: true, id, reason: typeof reason === 'string' ? reason : null };
}
