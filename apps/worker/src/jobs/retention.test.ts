import { describe, expect, it, vi } from 'vitest';
import { runRetention, startRetention } from './retention';

const logger = () => ({ info: vi.fn(), error: vi.fn() });

describe('WEBHOOK-PAYLOAD-RETENTION: job dọn của worker', () => {
  it('gọi hàm dọn ở ngữ cảnh trần với 14 ngày; log số lượng khi có dọn, im khi không có gì', async () => {
    const log = logger();
    const withSystem = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never));
    const db = { withSystem } as never;
    await runRetention({ db, logger: log });
    expect(withSystem).toHaveBeenCalledTimes(1);
  });

  it('lỗi KHÔNG ném ra (worker không sập), chỉ log tên lỗi, không log nội dung', async () => {
    const log = logger();
    const db = {
      withSystem: vi.fn(async () => {
        throw new Error('chuoi-ket-noi-bi-mat');
      }),
    } as never;
    await expect(runRetention({ db, logger: log })).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith({ error: 'Error' }, expect.any(String));
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('bi-mat');
  });

  it('startRetention chạy ngay, lặp theo chu kỳ, và hàm dừng ngắt vòng lặp', async () => {
    vi.useFakeTimers();
    try {
      const withSystem = vi.fn(async () => ({ payloads: 0, tombstones: 0 }));
      const stop = startRetention({ db: { withSystem } as never, logger: logger() }, 1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(withSystem).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(withSystem).toHaveBeenCalledTimes(3);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(withSystem).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
