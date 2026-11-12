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

/** Hàng đợi ẩn/bỏ ẩn bình luận (FR-044, ADR 009; thử lại 3 lần, backoff mũ). */
export const HIDE_QUEUE = 'hide';

/** Hàng đợi "Kiểm tra toàn bộ kết nối" của một workspace (Owner bấm ở Cài đặt → Kênh). */
export const CHANNEL_CHECK_QUEUE = 'channel-check';

/** Hàng đợi "Đồng bộ ngay" Shopify của một workspace (Owner bấm ở Cơ sở kiến thức › Nguồn dữ liệu). */
export const SHOPIFY_SYNC_QUEUE = 'shopify-sync';
/** Khóa ngữ cảnh mã hóa (AAD) token Shopify: một cửa hàng mỗi workspace. Web mã hóa và worker giải mã phải dùng CÙNG giá trị. */
export const SHOPIFY_TOKEN_KEY = 'shopify';
/** Khóa ngữ cảnh mã hóa (AAD) token System User Facebook: một token mỗi workspace (migration 0086). */
export const FB_SYSTEM_TOKEN_KEY = 'fb-system-user';
export const shopifySyncJobSchema = z.object({ workspaceId: z.uuid() });
export type ShopifySyncJob = z.infer<typeof shopifySyncJobSchema>;
export const channelCheckJobSchema = z.object({ workspaceId: z.uuid() });
export type ChannelCheckJob = z.infer<typeof channelCheckJobSchema>;

/** Dữ liệu job `hide`: chỉ id (hành động ẩn/bỏ ẩn nằm ở `cf.comment_hides`, không đi qua hàng đợi). */
export const hideJobSchema = z.object({
  workspaceId: z.uuid(),
  hideId: z.uuid(),
});
export type HideJob = z.infer<typeof hideJobSchema>;

/** Hàng đợi xử lý AI một bình luận (docs/09 §9: `pipeline`, thử lại 3 lần). */
export const PIPELINE_QUEUE = 'pipeline';

/** Dữ liệu job `pipeline`: chỉ id + cách kích hoạt (không nội dung bình luận/PII); worker đọc bình luận từ DB. */
export const pipelineJobSchema = z.object({
  workspaceId: z.uuid(),
  commentId: z.uuid(),
  trigger: z.enum(['auto', 'manual']),
  /** Người bấm "Soạn gợi ý" (chỉ `trigger: manual`); worker kiểm là thành viên đang hoạt động và ghi `action_logs`. */
  requestedBy: z.uuid().optional(),
});
export type PipelineJob = z.infer<typeof pipelineJobSchema>;
