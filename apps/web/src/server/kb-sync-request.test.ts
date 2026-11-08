import { KB_SYNC_QUEUE } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { createKbSyncRequester } from './kb-sync-request';

const ws = '11111111-1111-4111-8111-111111111111';

describe('createKbSyncRequester — xếp job đồng bộ khi nguồn kiến thức đổi', () => {
  it('xếp đúng hàng đợi với khóa gộp theo workspace (debounce) và không mang nội dung', async () => {
    const enqueue = vi.fn(async () => {});
    await createKbSyncRequester({ enqueue, warn: vi.fn() })(ws);
    expect(enqueue).toHaveBeenCalledWith(
      KB_SYNC_QUEUE,
      { workspaceId: ws },
      { singletonKey: ws, singletonSeconds: 10, startAfter: 10 },
    );
  });

  it('lỗi hàng đợi KHÔNG làm hỏng việc lưu của Owner: chỉ cảnh báo, không ném', async () => {
    const warn = vi.fn();
    const enqueue = vi.fn(async () => {
      throw new Error('boss down');
    });
    await expect(createKbSyncRequester({ enqueue, warn })(ws)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith({ event: 'kb_sync_enqueue_failed', workspaceId: ws });
  });
});
