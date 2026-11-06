import { describe, expect, it, vi } from 'vitest';
import type { ExportFileStore } from '../export-store';
import { runRetention } from './retention';

const logger = () => ({ info: vi.fn(), error: vi.fn() });
const store = (): ExportFileStore => ({ put: vi.fn(), remove: vi.fn(async () => undefined) });

describe('FR-094 dọn yêu cầu xuất dữ liệu (job retention)', () => {
  it('FR-094 không có kho tệp (cờ tắt) → không chạm bảng data_exports', async () => {
    const withSystem = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never));
    await runRetention({ db: { withSystem } as never, logger: logger() });
    expect(withSystem).toHaveBeenCalledTimes(4);
  });

  it('FR-094 có kho tệp → thêm hai lần dọn (kẹt + hết hạn), xóa tệp của yêu cầu hết hạn', async () => {
    const s = store();
    const key = `exports/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/x.jsonl`;
    const calls: string[] = [];
    const withSystem = vi.fn(async (fn: (tx: never) => Promise<unknown>) => {
      // Hàm DB thật bị thay bằng mock ở lớp @flow/db trong test này
      return fn({ __expect: calls } as never);
    });
    const ops = {
      failStale: vi.fn(async () => 2),
      expire: vi.fn(async () => [{ id: 'e1', workspaceId: 'w', fileKey: key }]),
    };
    const log = logger();
    await runRetention({
      db: { withSystem } as never,
      logger: log,
      exportStore: s,
      exportOps: ops,
    });
    expect(ops.failStale).toHaveBeenCalledTimes(1);
    expect(ops.expire).toHaveBeenCalledTimes(1);
    expect(s.remove).toHaveBeenCalledWith(key);
    expect(log.info).toHaveBeenCalledWith({ stale: 2 }, expect.any(String));
    expect(log.info).toHaveBeenCalledWith({ expired: 1 }, expect.any(String));
  });

  it('FR-094 xóa tệp lỗi → không ném, log tên lỗi; lỗi DB cũng không ném', async () => {
    const s = store();
    (s.remove as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('secret-path'));
    const withSystem = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never));
    const log = logger();
    const ops = {
      failStale: vi.fn(async () => {
        throw new Error('db-secret');
      }),
      expire: vi.fn(async () => [{ id: 'e1', workspaceId: 'w', fileKey: 'k' }]),
    };
    await expect(
      runRetention({ db: { withSystem } as never, logger: log, exportStore: s, exportOps: ops }),
    ).resolves.toBeUndefined();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('secret');
    expect(log.error).toHaveBeenCalled();
  });
});
