import { createMockEmbedder } from '@flow/ai';
import type { Database } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import { type KbReembedDeps, runKbReembed } from './kb-reembed';

const WS = '00000000-0000-4000-8000-000000000001';
const tx = {} as Database;

describe('FR-133 runKbReembed', () => {
  it('nối ops DB theo đúng workspace + mô hình của embedder, trả số liệu', async () => {
    const list = vi.fn(async () => []);
    const write = vi.fn(async () => 0);
    const deps: KbReembedDeps = {
      embedder: createMockEmbedder('m2'),
      listChunks: list,
      writeChunks: write,
    };
    const result = await runKbReembed(tx, WS, deps);
    expect(result).toEqual({ reembedded: 0, skipped: 0, batches: 0 });
    expect(list).toHaveBeenCalledWith(tx, WS, 'm2', expect.any(Number));
    expect(write).not.toHaveBeenCalled();
  });

  it('có đoạn → ghi qua writeChunks với workspace/mô hình đúng', async () => {
    let pending = [
      { id: 'c1', contentHash: 'h1', lang: 'vi' as const, contextHeader: null, content: 'a' },
    ];
    const write = vi.fn(async () => {
      pending = [];
      return 1;
    });
    const result = await runKbReembed(tx, WS, {
      embedder: createMockEmbedder('m2'),
      listChunks: async () => pending,
      writeChunks: write,
    });
    expect(result.reembedded).toBe(1);
    expect(write).toHaveBeenCalledWith(tx, WS, 'm2', [
      expect.objectContaining({ id: 'c1', contentHash: 'h1' }),
    ]);
  });
});
