import { describe, expect, it, vi } from 'vitest';
import type { Embedder } from '../kb-indexing';
import { reembedWorkspaceProducts } from './reembed-products';

const embedderOf = (model: string): Embedder =>
  ({
    model,
    dimensions: 1024,
    embed: vi.fn(async (texts: readonly string[]) =>
      texts.map(() => Array.from({ length: 1024 }, () => 0.5)),
    ),
  }) as unknown as Embedder;

describe('reembedWorkspaceProducts — tạo lại vector tên sản phẩm', () => {
  it('embed TÊN sản phẩm theo lô, ghi kèm model đích; xong rời điều kiện list nên chạy lại → 0', async () => {
    let pending = [
      { id: 'p1', name: 'Gối massage cổ' },
      { id: 'p2', name: 'Áo thun basic' },
    ];
    const embedder = embedderOf('bge-m3');
    const write = vi.fn(async (_m: string, rows: { id: string }[]) => {
      pending = [];
      return rows.length;
    });
    const out = await reembedWorkspaceProducts({
      embedder,
      ops: { list: async () => pending, write },
      batchSize: 10,
    });
    expect(out).toEqual({ reembedded: 2, skipped: 0, batches: 1 });
    expect(embedder.embed).toHaveBeenCalledWith(['Gối massage cổ', 'Áo thun basic']);
    expect(write).toHaveBeenCalledWith('bge-m3', [
      expect.objectContaining({ id: 'p1', name: 'Gối massage cổ' }),
      expect.objectContaining({ id: 'p2', name: 'Áo thun basic' }),
    ]);
    const again = await reembedWorkspaceProducts({
      embedder,
      ops: { list: async () => [], write },
    });
    expect(again).toEqual({ reembedded: 0, skipped: 0, batches: 0 });
  });

  it('sản phẩm đổi tên giữa chừng (ghi trả 0) → tính skipped, không ghi vector của tên cũ', async () => {
    let calls = 0;
    const out = await reembedWorkspaceProducts({
      embedder: embedderOf('bge-m3'),
      ops: {
        list: async () => (calls++ < 1 ? [{ id: 'p1', name: 'Tên cũ' }] : []),
        write: async () => 0,
      },
    });
    expect(out).toMatchObject({ reembedded: 0, skipped: 1 });
  });
});
