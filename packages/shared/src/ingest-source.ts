/**
 * Nguồn của một sự kiện bình luận (`webhook_events.payload.source`, Q-POR1): `polling` = bù bình luận webhook rớt (FR-023),
 * `backfill` = lấy ngược khi kết nối (FR-011); không có `source` = webhook trực tiếp. Lưu vào `comments.ingest_source` để quyết định
 * bình luận nào tự chạy pipeline (backfill thì KHÔNG) và để job quét nhận ra bình luận backfill. Hàm thuần, không ném.
 */
export const INGEST_SOURCES = ['webhook', 'polling', 'backfill'] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export function ingestSourceOf(payload: unknown): IngestSource {
  if (typeof payload !== 'object' || payload === null) return 'webhook';
  const source = (payload as { source?: unknown }).source;
  return source === 'polling' || source === 'backfill' ? source : 'webhook';
}
