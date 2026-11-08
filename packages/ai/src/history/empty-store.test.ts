import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyHistoryStore } from './empty-store';
import { createInMemoryHistoryStore } from './memory-store';

afterEach(() => vi.unstubAllEnvs());

describe('createEmptyHistoryStore (chưa có bảng AI đã gửi)', () => {
  it('luôn trống, không bịa dữ liệu; đánh dấu sai → not_found', async () => {
    const store = createEmptyHistoryStore();
    expect(await store.list('ws', { status: 'all', limit: 20, offset: 0 })).toEqual({
      items: [],
      total: 0,
    });
    expect(await store.all('ws')).toEqual([]);
    expect(
      await store.markWrong('ws', 'id', { userId: 'u', role: 'owner' }, 'sai', new Date()),
    ).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('createInMemoryHistoryStore chỉ cho test', () => {
  it('tiến trình không phải test (web/worker) nạp → lỗi ngay', () => {
    vi.stubEnv('VITEST', undefined as never);
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => createInMemoryHistoryStore()).toThrow(/createInMemoryHistoryStore/);
  });
});
