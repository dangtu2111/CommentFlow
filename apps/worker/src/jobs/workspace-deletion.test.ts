import { describe, expect, it, vi } from 'vitest';
import { runWorkspaceDeletion, startWorkspaceDeletion } from './workspace-deletion';

const logger = () => ({ info: vi.fn(), error: vi.fn() });

type Tx = Record<string, never>;

function makeDb(due: Array<{ workspaceId: string; requestId: string }>) {
  const withSystem = vi.fn(async (fn: (tx: Tx) => Promise<unknown>) => fn({}));
  const withJob = vi.fn(async (_ws: string, fn: (tx: Tx) => Promise<unknown>) => fn({}));
  return { db: { withSystem, withJob } as never, withSystem, withJob, due };
}

describe('FR-094 job xóa workspace của worker', () => {
  it('cờ TẮT (mặc định): không chạm DB, không log', async () => {
    const log = logger();
    const { db, withSystem, withJob } = makeDb([]);
    await runWorkspaceDeletion({ db, logger: log, enabled: false });
    expect(withSystem).not.toHaveBeenCalled();
    expect(withJob).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('cờ bật: liệt kê yêu cầu tới hạn rồi xóa từng workspace trong withJob của chính nó', async () => {
    const log = logger();
    const { db, withJob } = makeDb([]);
    const list = vi.fn(async () => [
      { workspaceId: 'ws-a', requestId: 'rq-a' },
      { workspaceId: 'ws-b', requestId: 'rq-b' },
    ]);
    const execute = vi.fn(async (_tx: unknown, _ws: string, _rq: string) => 'deleted' as const);
    await runWorkspaceDeletion({ db, logger: log, enabled: true, list, execute });
    expect(withJob.mock.calls.map((c) => c[0])).toEqual(['ws-a', 'ws-b']);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['ws-a', 'rq-a'],
      ['ws-b', 'rq-b'],
    ]);
    expect(log.info).toHaveBeenCalledWith({ deleted: 2, skipped: 0 }, expect.any(String));
  });

  it('hàm DB nói chưa tới hạn/đã hủy → bỏ qua, không tính là đã xóa', async () => {
    const log = logger();
    const { db } = makeDb([]);
    const list = vi.fn(async () => [
      { workspaceId: 'ws-a', requestId: 'rq-a' },
      { workspaceId: 'ws-b', requestId: 'rq-b' },
    ]);
    const execute = vi.fn(async (_tx: unknown, ws: string) =>
      ws === 'ws-a' ? ('not_scheduled' as const) : ('deleted' as const),
    );
    await runWorkspaceDeletion({ db, logger: log, enabled: true, list, execute });
    expect(log.info).toHaveBeenCalledWith({ deleted: 1, skipped: 1 }, expect.any(String));
  });

  it('một workspace lỗi KHÔNG chặn workspace sau; log chỉ tên lỗi + id yêu cầu, không nội dung lỗi', async () => {
    const log = logger();
    const { db } = makeDb([]);
    const list = vi.fn(async () => [
      { workspaceId: 'ws-a', requestId: 'rq-a' },
      { workspaceId: 'ws-b', requestId: 'rq-b' },
    ]);
    const execute = vi.fn(async (_tx: unknown, ws: string) => {
      if (ws === 'ws-a') throw new Error('chuoi-ket-noi-bi-mat');
      return 'deleted' as const;
    });
    await expect(
      runWorkspaceDeletion({ db, logger: log, enabled: true, list, execute }),
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(
      { error: 'Error', requestId: 'rq-a' },
      expect.any(String),
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('bi-mat');
    expect(log.info).toHaveBeenCalledWith({ deleted: 1, skipped: 0 }, expect.any(String));
  });

  it('liệt kê lỗi → không ném (worker không sập), log tên lỗi', async () => {
    const log = logger();
    const { db } = makeDb([]);
    const list = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      runWorkspaceDeletion({ db, logger: log, enabled: true, list }),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith({ error: 'Error' }, expect.any(String));
  });

  it('không có yêu cầu tới hạn → im lặng', async () => {
    const log = logger();
    const { db } = makeDb([]);
    await runWorkspaceDeletion({ db, logger: log, enabled: true, list: async () => [] });
    expect(log.info).not.toHaveBeenCalled();
  });

  it('startWorkspaceDeletion: cờ tắt → không chạy và hàm dừng vẫn gọi được; cờ bật → chạy ngay rồi lặp', async () => {
    vi.useFakeTimers();
    try {
      const list = vi.fn(async () => []);
      const { db } = makeDb([]);
      const off = startWorkspaceDeletion({ db, logger: logger(), enabled: false, list }, 1000);
      await vi.advanceTimersByTimeAsync(3000);
      expect(list).not.toHaveBeenCalled();
      off();
      const stop = startWorkspaceDeletion({ db, logger: logger(), enabled: true, list }, 1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(list).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(list).toHaveBeenCalledTimes(3);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(list).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
