import { KB_SYNC_QUEUE, kbSyncEnqueueOptions } from '@flow/shared';
import { enqueueJob } from './queue';

type Enqueue = (queue: string, data: object, options?: object) => Promise<void>;

/**
 * Xếp job `kb-sync` khi nguồn kiến thức nhập tay đổi (chính sách, FAQ, thông tin shop). Gộp theo workspace trong ~10 giây
 * (`kbSyncEnqueueOptions`); job chỉ mang `workspaceId`. Lỗi hàng đợi KHÔNG làm hỏng việc lưu — chỉ cảnh báo (lần lưu sau hoặc
 * lần quét sau đồng bộ lại). Chỉ ghi BẢN NHÁP; xuất bản do Owner bấm.
 */
export function createKbSyncRequester(deps: {
  enqueue: Enqueue;
  warn: (event: { event: string; workspaceId: string }) => void;
}) {
  return async (workspaceId: string): Promise<void> => {
    try {
      await deps.enqueue(KB_SYNC_QUEUE, { workspaceId }, kbSyncEnqueueOptions(workspaceId));
    } catch {
      deps.warn({ event: 'kb_sync_enqueue_failed', workspaceId });
    }
  };
}

/** Bản dùng chung của web (Server Action nguồn kiến thức, nhập Excel…): gộp ~10 giây/workspace, không ném lỗi. */
export const requestKbSync = createKbSyncRequester({
  enqueue: enqueueJob,
  warn: (event) => console.warn(JSON.stringify(event)),
});
