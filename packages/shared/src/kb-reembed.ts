import { z } from 'zod';

/** Hàng đợi job tạo lại embedding khi đổi mô hình (FR-133). */
export const KB_REEMBED_QUEUE = 'kb-reembed';
/** Trần số đoạn mỗi lô gọi embedder/ghi DB. */
export const KB_REEMBED_BATCH_MAX = 64;

/** Dữ liệu job `kb-reembed`: chỉ id workspace; mô hình đích do embedder của worker quyết định. */
export const kbReembedJobSchema = z.object({ workspaceId: z.uuid() });
export type KbReembedJob = z.infer<typeof kbReembedJobSchema>;
