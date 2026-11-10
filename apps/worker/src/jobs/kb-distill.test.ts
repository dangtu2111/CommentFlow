import type { Distiller } from '@flow/ai';
import type { FlowDb } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  insert: vi.fn(),
  mark: vi.fn(),
}));
vi.mock('@flow/db', () => ({
  insertDistilledFaqDrafts: mocks.insert,
  listChunksToDistill: mocks.list,
  markChunksDistilled: mocks.mark,
}));

import { distillAfterSync } from './kb-distill';

const db = { withJob: (_ws: string, fn: (tx: unknown) => unknown) => fn({}) } as unknown as FlowDb;
const logger = { info: vi.fn(), warn: vi.fn() };
const SOURCE = 'Áo thun làm từ cotton 100%, xuất xứ Việt Nam.';
const goodItem = {
  kind: 'product_attr' as const,
  question: 'Áo làm từ chất liệu gì?',
  answer: 'Áo làm từ cotton 100%.',
  evidenceQuote: SOURCE,
};

describe('distillAfterSync — chắt lọc sau đồng bộ', () => {
  it('cờ tắt hoặc không cấu hình → không đọc DB, không gọi LLM', async () => {
    const distiller: Distiller = { distill: vi.fn() };
    await distillAfterSync({ db, logger, distill: undefined, workspaceId: 'w' });
    await distillAfterSync({
      db,
      logger,
      distill: { enabled: async () => false, distiller },
      workspaceId: 'w',
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(distiller.distill).not.toHaveBeenCalled();
  });

  it('cờ bật → đọc đoạn, gọi LLM, ghi nháp đạt kiểm cứng và đánh dấu đoạn', async () => {
    mocks.list.mockResolvedValue([{ id: 'c1', content: SOURCE, contentHash: 'h1' }]);
    mocks.insert.mockImplementation(async (_tx, _ws, items: unknown[]) => items.length);
    const distiller: Distiller = {
      distill: vi.fn(async () => ({ items: [goodItem], malformed: 0, costUsd: 0.01 })),
    };
    await distillAfterSync({
      db,
      logger,
      distill: { enabled: async () => true, distiller },
      workspaceId: 'w',
    });
    expect(distiller.distill).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]?.[2]).toMatchObject([
      { kind: 'product_attr', sourceChunkId: 'c1', evidenceQuote: SOURCE },
    ]);
    expect(mocks.mark).toHaveBeenCalledWith({}, 'w', [{ id: 'c1', contentHash: 'h1' }]);
  });

  it('LLM lỗi → chỉ log cảnh báo, không ném, không ghi nháp', async () => {
    mocks.insert.mockClear();
    mocks.mark.mockClear();
    mocks.list.mockResolvedValue([{ id: 'c1', content: SOURCE, contentHash: 'h1' }]);
    const distiller: Distiller = {
      distill: vi.fn(async () => {
        throw new Error('LLM_UNAVAILABLE');
      }),
    };
    await expect(
      distillAfterSync({
        db,
        logger,
        distill: { enabled: async () => true, distiller },
        workspaceId: 'w',
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });
});
