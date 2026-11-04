import { z } from 'zod';

/** Tên hàng đợi pg-boss dùng chung giữa web (gửi job) và worker (xử lý). docs/09 §9. */
export const INGEST_QUEUE = 'ingest';

/** Dữ liệu job `ingest`: chỉ id (không chứa nội dung bình luận/PII); worker đọc sự kiện từ `webhook_events`. */
export const ingestJobSchema = z.object({
  workspaceId: z.uuid(),
  eventId: z.uuid(),
});
export type IngestJob = z.infer<typeof ingestJobSchema>;

/** Hàng đợi gửi trả lời (docs/09 §9: `send`, thử lại 3 lần, backoff mũ). */
export const SEND_QUEUE = 'send';

/** Dữ liệu job `send`: chỉ id (nội dung câu trả lời nằm ở `cf.comment_replies`, không đi qua hàng đợi). */
export const sendJobSchema = z.object({
  workspaceId: z.uuid(),
  replyId: z.uuid(),
});
export type SendJob = z.infer<typeof sendJobSchema>;
