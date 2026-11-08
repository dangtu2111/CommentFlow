import { z } from 'zod';

/**
 * Đồng bộ nguồn nhập tay (thông tin shop, chính sách, FAQ, sản phẩm) vào BẢN NHÁP kiến thức (KB-SYNC-DRAFT).
 * Job chỉ mang `workspaceId`; nội dung không đi qua hàng đợi. Chỉ ghi bản nháp — xuất bản do Owner bấm (`kb-publish`).
 */
export const KB_SYNC_QUEUE = 'kb-sync';
/** Gộp nhiều lần lưu liên tiếp: tối đa một job mỗi workspace trong khoảng này (job đọc trạng thái mới nhất lúc chạy). */
export const KB_SYNC_DEBOUNCE_SECONDS = 10;

export const kbSyncJobSchema = z.object({ workspaceId: z.uuid() });
export type KbSyncJob = z.infer<typeof kbSyncJobSchema>;

/** Tùy chọn pg-boss khi xếp job đồng bộ: một lượt/workspace trong cửa sổ gộp, chạy sau cửa sổ đó (lần lưu cuối được đọc lúc chạy). */
export function kbSyncEnqueueOptions(workspaceId: string): {
  singletonKey: string;
  singletonSeconds: number;
  startAfter: number;
} {
  return {
    singletonKey: workspaceId,
    singletonSeconds: KB_SYNC_DEBOUNCE_SECONDS,
    startAfter: KB_SYNC_DEBOUNCE_SECONDS,
  };
}
