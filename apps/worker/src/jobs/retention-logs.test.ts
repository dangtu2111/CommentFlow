import { purgeExpiredRetrievalLogs, purgeExpiredWebhookPayloads } from '@flow/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runRetention } from './retention';

vi.mock('@flow/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flow/db')>()),
  purgeExpiredWebhookPayloads: vi.fn(),
  purgeExpiredRetrievalLogs: vi.fn(),
}));

const logger = () => ({ info: vi.fn(), error: vi.fn() });
const db = () =>
  ({ withSystem: vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never)) }) as never;

describe('FR-134 job dọn nhật ký tìm kiếm quá 90 ngày (retention của worker)', () => {
  beforeEach(() => {
    vi.mocked(purgeExpiredWebhookPayloads)
      .mockReset()
      .mockResolvedValue({ payloads: 0, tombstones: 0 });
    vi.mocked(purgeExpiredRetrievalLogs).mockReset().mockResolvedValue(0);
  });

  it('FR-134 gọi dọn nhật ký với 90 ngày (mặc định), log số dòng khi có dọn', async () => {
    vi.mocked(purgeExpiredRetrievalLogs).mockResolvedValue(7);
    const log = logger();
    await runRetention({ db: db(), logger: log });
    expect(purgeExpiredRetrievalLogs).toHaveBeenCalledWith(expect.anything(), 90);
    expect(log.info).toHaveBeenCalledWith({ retrievalLogs: 7 }, expect.any(String));
  });

  it('FR-134 không dọn được gì thì im lặng', async () => {
    const log = logger();
    await runRetention({ db: db(), logger: log });
    expect(log.info).not.toHaveBeenCalled();
  });

  it('FR-134 dọn payload webhook lỗi KHÔNG chặn dọn nhật ký, và ngược lại; log chỉ tên lỗi', async () => {
    vi.mocked(purgeExpiredWebhookPayloads).mockRejectedValue(new Error('bi-mat-1'));
    const log = logger();
    await runRetention({ db: db(), logger: log });
    expect(purgeExpiredRetrievalLogs).toHaveBeenCalledTimes(1);

    vi.mocked(purgeExpiredWebhookPayloads).mockResolvedValue({ payloads: 0, tombstones: 0 });
    vi.mocked(purgeExpiredRetrievalLogs).mockRejectedValue(new Error('bi-mat-2'));
    await runRetention({ db: db(), logger: log });
    expect(purgeExpiredWebhookPayloads).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('bi-mat');
  });
});
