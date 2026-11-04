import { z } from 'zod';

/** Tên hàng đợi pg-boss dùng chung giữa web (gửi job) và worker (xử lý). docs/09 §9. */
export const INGEST_QUEUE = 'ingest';

/** Dữ liệu job `ingest`: chỉ id (không chứa nội dung bình luận/PII); worker đọc sự kiện từ `webhook_events`. */
export const ingestJobSchema = z.object({
  workspaceId: z.uuid(),
  eventId: z.uuid(),
});
export type IngestJob = z.infer<typeof ingestJobSchema>;
