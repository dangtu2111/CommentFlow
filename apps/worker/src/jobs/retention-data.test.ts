import {
  compactAiUsage,
  purgeExpiredRetrievalLogs,
  purgeExpiredWebhookPayloads,
  purgeExpiredWorkspaceData,
} from '@flow/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runRetention } from './retention';

vi.mock('@flow/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flow/db')>()),
  purgeExpiredWebhookPayloads: vi.fn(),
  purgeExpiredRetrievalLogs: vi.fn(),
  purgeExpiredWorkspaceData: vi.fn(),
  compactAiUsage: vi.fn(),
}));

const logger = () => ({ info: vi.fn(), error: vi.fn() });
const db = () => {
  const withSystem = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never));
  return { withSystem, handle: { withSystem } as never };
};

describe('FR-126 job retention: dữ liệu 12 tháng + gộp ai_usage 90 ngày', () => {
  beforeEach(() => {
    vi.mocked(purgeExpiredWebhookPayloads)
      .mockReset()
      .mockResolvedValue({ payloads: 0, tombstones: 0 });
    vi.mocked(purgeExpiredRetrievalLogs).mockReset().mockResolvedValue(0);
    vi.mocked(purgeExpiredWorkspaceData)
      .mockReset()
      .mockResolvedValue({ comments: 0, drafts: 0, leads: 0 });
    vi.mocked(compactAiUsage).mockReset().mockResolvedValue(0);
  });

  it('FR-126 xóa dữ liệu workspace với 365 ngày và gộp ai_usage với 90 ngày, đều trong withSystem', async () => {
    const d = db();
    await runRetention({ db: d.handle, logger: logger() });
    expect(purgeExpiredWorkspaceData).toHaveBeenCalledWith(expect.anything(), 365);
    expect(compactAiUsage).toHaveBeenCalledWith(expect.anything(), 90);
    expect(d.withSystem).toHaveBeenCalledTimes(4);
  });

  it('FR-126 log chỉ có SỐ LƯỢNG (không nội dung khách) khi có dọn', async () => {
    vi.mocked(purgeExpiredWorkspaceData).mockResolvedValue({ comments: 3, drafts: 2, leads: 1 });
    vi.mocked(compactAiUsage).mockResolvedValue(40);
    const log = logger();
    await runRetention({ db: db().handle, logger: log });
    expect(log.info).toHaveBeenCalledWith({ comments: 3, drafts: 2, leads: 1 }, expect.any(String));
    expect(log.info).toHaveBeenCalledWith({ aiUsageCompacted: 40 }, expect.any(String));
  });

  it('FR-126 không log khi không có gì để dọn', async () => {
    const log = logger();
    await runRetention({ db: db().handle, logger: log });
    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('FR-126 mỗi bước độc lập: dọn dữ liệu lỗi vẫn gộp ai_usage; log chỉ tên lỗi, không ném', async () => {
    vi.mocked(purgeExpiredWorkspaceData).mockRejectedValue(
      Object.assign(new Error('secret phone 0901234567'), { name: 'PgError' }),
    );
    const log = logger();
    await expect(runRetention({ db: db().handle, logger: log })).resolves.toBeUndefined();
    expect(compactAiUsage).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith({ error: 'PgError' }, expect.any(String));
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('0901234567');
  });

  it('FR-126 gộp ai_usage lỗi không chặn dọn dữ liệu', async () => {
    vi.mocked(compactAiUsage).mockRejectedValue(new Error('x'));
    const log = logger();
    await runRetention({ db: db().handle, logger: log });
    expect(purgeExpiredWorkspaceData).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
