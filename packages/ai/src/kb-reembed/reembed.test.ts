import { describe, expect, it } from 'vitest';
import { createMockEmbedder, EMBEDDING_DIMENSIONS } from '../kb-indexing';
import { type ReembedOps, reembedWorkspaceChunks } from './reembed';

type Row = {
  id: string;
  contentHash: string;
  lang: 'vi' | 'en';
  contextHeader: string | null;
  content: string;
  model: string | null;
};

/** DB giả trong bộ nhớ: giữ đúng hợp đồng của `listChunksToReembed`/`writeReembeddedChunks`. */
function fakeOps(rows: Row[]) {
  const writes: string[][] = [];
  const ops: ReembedOps = {
    list: async (model, limit) => rows.filter((r) => r.model !== model).slice(0, limit),
    write: async (model, batch) => {
      writes.push(batch.map((b) => b.id));
      let n = 0;
      for (const item of batch) {
        const row = rows.find((r) => r.id === item.id);
        if (row && row.contentHash === item.contentHash) {
          row.model = model;
          n += 1;
        }
      }
      return n;
    },
  };
  return { ops, writes };
}

const chunk = (i: number, model: string | null): Row => ({
  id: `c${i}`,
  contentHash: `h${i}`,
  lang: 'vi',
  contextHeader: i % 2 === 0 ? 'Chính sách › Đổi trả' : null,
  content: `nội dung ${i}`,
  model,
});

describe('FR-133 reembedWorkspaceChunks', () => {
  it('chỉ tạo lại đoạn khác mô hình đích (kể cả NULL), theo lô', async () => {
    const rows = [
      chunk(1, 'old'),
      chunk(2, null),
      chunk(3, 'new-v2'),
      chunk(4, 'old'),
      chunk(5, 'old'),
    ];
    const { ops, writes } = fakeOps(rows);
    const result = await reembedWorkspaceChunks({
      embedder: createMockEmbedder('new-v2'),
      ops,
      batchSize: 2,
    });
    expect(result).toEqual({ reembedded: 4, skipped: 0, batches: 2 });
    expect(writes).toEqual([
      ['c1', 'c2'],
      ['c4', 'c5'],
    ]);
    expect(rows.every((r) => r.model === 'new-v2')).toBe(true);
  });

  it('chạy lại → 0 đoạn, không gọi embedder', async () => {
    const rows = [chunk(1, 'new-v2')];
    const { ops } = fakeOps(rows);
    let calls = 0;
    const base = createMockEmbedder('new-v2');
    const embedder = {
      model: base.model,
      embed: async (t: string[]) => {
        calls += 1;
        return base.embed(t);
      },
    };
    expect(await reembedWorkspaceChunks({ embedder, ops })).toEqual({
      reembedded: 0,
      skipped: 0,
      batches: 0,
    });
    expect(calls).toBe(0);
  });

  it('embed đúng văn bản "header + xuống dòng + nội dung"', async () => {
    const rows = [chunk(2, 'old')];
    const { ops } = fakeOps(rows);
    const seen: string[] = [];
    const base = createMockEmbedder('m2');
    await reembedWorkspaceChunks({
      embedder: {
        model: 'm2',
        embed: async (t) => {
          seen.push(...t);
          return base.embed(t);
        },
      },
      ops,
    });
    expect(seen).toEqual(['Chính sách › Đổi trả\nnội dung 2']);
  });

  it('đoạn đổi nội dung giữa chừng (hash lệch) → bỏ qua lần này, lô sau lấy nội dung mới', async () => {
    const rows = [chunk(1, 'old'), chunk(2, 'old')];
    const { ops } = fakeOps(rows);
    let raced = false;
    const racing: ReembedOps = {
      list: ops.list,
      write: async (model, batch) => {
        const first = rows[0];
        if (first && !raced) first.contentHash = 'changed';
        raced = true;
        return ops.write(model, batch);
      },
    };
    const result = await reembedWorkspaceChunks({
      embedder: createMockEmbedder('m2'),
      ops: racing,
      batchSize: 10,
      maxBatches: 5,
    });
    expect(result).toEqual({ reembedded: 2, skipped: 1, batches: 2 });
    expect(rows.every((r) => r.model === 'm2')).toBe(true);
  });

  it('dừng ở maxBatches khi vẫn còn đoạn', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => chunk(i, 'old'));
    const { ops } = fakeOps(rows);
    const result = await reembedWorkspaceChunks({
      embedder: createMockEmbedder('m2'),
      ops,
      batchSize: 2,
      maxBatches: 3,
    });
    expect(result).toEqual({ reembedded: 6, skipped: 0, batches: 3 });
  });

  it('embedder trả sai số chiều → ném lỗi, không ghi gì', async () => {
    const rows = [chunk(1, 'old')];
    const { ops, writes } = fakeOps(rows);
    await expect(
      reembedWorkspaceChunks({
        embedder: { model: 'm2', embed: async (t) => t.map(() => [1, 2, 3]) },
        ops,
      }),
    ).rejects.toThrow(String(EMBEDDING_DIMENSIONS));
    expect(writes).toEqual([]);
  });
});
