import type { Database } from '@flow/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
vi.mock('@flow/db/runtime', () => ({ searchKbChunks: (...args: unknown[]) => search(...args) }));

import { createDbKbSearcher } from './kb-searcher';

describe('FR-028/057 createDbKbSearcher — bọc searchKbChunks', () => {
  beforeEach(() => search.mockReset());

  it('chuyển workspace, phiên bản, ngôn ngữ, câu, vector, sản phẩm; trả hit nguyên vẹn', async () => {
    const tx = {} as Database;
    const hits = [{ id: 'c' }];
    search.mockResolvedValue(hits);
    const searcher = createDbKbSearcher(tx, { workspaceId: 'ws-1', versionId: 'ver-1' });
    const result = await searcher({
      queryText: 'đổi trả',
      lang: 'vi',
      queryVector: [0.1, 0.2],
      productIds: ['p-1'],
    });
    expect(result).toBe(hits);
    expect(search).toHaveBeenCalledWith(tx, {
      workspaceId: 'ws-1',
      versionId: 'ver-1',
      lang: 'vi',
      queryText: 'đổi trả',
      queryVector: [0.1, 0.2],
      productIds: ['p-1'],
    });
  });

  it('lỗi từ truy vấn được ném ra', async () => {
    const boom = new Error('db');
    search.mockImplementationOnce(async () => {
      throw boom;
    });
    const searcher = createDbKbSearcher({} as Database, { workspaceId: 'w', versionId: 'v' });
    const failure = await searcher({
      queryText: 'q',
      lang: 'en',
      queryVector: [],
      productIds: [],
    }).catch((error: unknown) => error);
    expect(failure).toBe(boom);
  });
});
