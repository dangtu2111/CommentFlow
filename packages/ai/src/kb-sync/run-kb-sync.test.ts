import type { Database } from '@flow/db/runtime';
import { describe, expect, it, vi } from 'vitest';
import { createMockEmbedder } from '../kb-indexing';
import { markDraftConflicts } from './run-kb-publish';
import { defaultKbSyncOps, type KbSyncOps, runKbSync } from './run-kb-sync';

const WS = '11111111-1111-4111-8111-111111111111';
const tx = {} as Database;
const mlConfig = {
  kind: 'ml' as const,
  model: 'm',
  embedder: createMockEmbedder('m'),
  describe: { kind: 'ml' as const, model: 'm', note: 'test' },
};
const offConfig = {
  kind: 'off' as const,
  reason: 'service_disabled' as const,
  model: null,
  embedder: null,
  describe: { kind: 'off' as const, model: null, note: 'TẮT — thiếu dịch vụ' },
};

function fakeOps(over: Partial<KbSyncOps> = {}) {
  const calls: string[] = [];
  const ops: KbSyncOps = {
    lock: vi.fn(async () => void calls.push('lock')),
    listPolicies: vi.fn(async () => []),
    listFaqs: vi.fn(async () => []),
    listShops: vi.fn(async () => []),
    listProducts: vi.fn(async () => ({ rows: [], truncated: false })),
    findOrCreateSource: vi.fn(async (_t, _w, kind) => `src-${kind}`),
    findSource: vi.fn(async () => null),
    listDraftState: vi.fn(async () => []),
    upsert: vi.fn(async () => undefined),
    refreshMeta: vi.fn(async () => undefined),
    remove: vi.fn(async () => 0),
    setTopics: vi.fn(async () => undefined),
    listProductNamesToEmbed: vi.fn(async () => []),
    writeProductNameVectors: vi.fn(async () => 0),
    ...over,
  } as unknown as KbSyncOps;
  return { ops, calls };
}

const policy = {
  id: 'p1',
  kind: 'shipping',
  lang: 'vi',
  title: 'Giao hàng',
  content: '## Thời gian\nGiao trong 2 ngày.\n\n## Phí\nPhí ship 30.000đ.',
  updatedAt: new Date(),
};

describe('runKbSync — lõi dùng chung worker + EVAL', () => {
  it('embedding tắt → CONFIG_INVALID, KHÔNG ghi gì', async () => {
    const { ops } = fakeOps();
    await expect(
      runKbSync(tx, { workspaceId: WS }, { ops, resolveEmbedding: async () => offConfig }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
    expect(ops.upsert).not.toHaveBeenCalled();
    expect(ops.lock).toHaveBeenCalled();
  });

  it('chính sách → nguồn policy, đoạn theo mục có chủ đề; nguồn không có tài liệu và chưa tồn tại thì bỏ qua', async () => {
    const { ops } = fakeOps({ listPolicies: vi.fn(async () => [policy]) as never });
    const stats = await runKbSync(
      tx,
      { workspaceId: WS },
      { ops, resolveEmbedding: async () => mlConfig },
    );
    expect(stats).toMatchObject({
      sources: 1,
      chunksWritten: 2,
      chunksRemoved: 0,
      productsTruncated: false,
    });
    expect(ops.findOrCreateSource).toHaveBeenCalledTimes(1);
    expect(ops.findSource).toHaveBeenCalledTimes(3); // faq, shop, product: không tài liệu
    const topics = (ops.setTopics as ReturnType<typeof vi.fn>).mock.calls[0]?.[3];
    expect(topics.map((t: { topic: string }) => t.topic)).toEqual([
      'shipping_time',
      'shipping_fee',
    ]);
  });

  it('nguồn đã tồn tại nhưng hết tài liệu → vẫn chạy để xóa đoạn cũ; báo sản phẩm vượt giới hạn', async () => {
    const remove = vi.fn(async () => 3);
    const { ops } = fakeOps({
      findSource: vi.fn(async (_t, _w, kind) => (kind === 'faq' ? 'src-faq' : null)) as never,
      listDraftState: vi.fn(async () => [
        { chunkKey: 'faq:old#0', contentHash: 'h', embeddingModel: 'm' },
      ]) as never,
      remove: remove as never,
      listProducts: vi.fn(async () => ({ rows: [], truncated: true })) as never,
    });
    const stats = await runKbSync(
      tx,
      { workspaceId: WS },
      { ops, resolveEmbedding: async () => mlConfig },
    );
    expect(remove).toHaveBeenCalledWith(tx, WS, 'src-faq', ['faq:old#0']);
    expect(stats).toMatchObject({ chunksRemoved: 3, productsTruncated: true });
  });

  it('FAQ/shop/sản phẩm đều thành nguồn riêng với chủ đề: FAQ theo nội dung, shop other, sản phẩm product_info', async () => {
    const { ops } = fakeOps({
      listFaqs: vi.fn(async () => [
        {
          id: 'f1',
          lang: 'vi',
          question: 'Bảo hành bao lâu?',
          answer: 'Bảo hành 12 tháng.',
          tags: [],
          updatedAt: new Date(),
        },
      ]) as never,
      listShops: vi.fn(async () => [
        {
          lang: 'vi',
          name: 'Shop A',
          description: 'Shop thời trang',
          address: null,
          openingHours: null,
          contact: null,
          website: null,
        },
      ]) as never,
      listProducts: vi.fn(async () => ({
        rows: [{ id: 'p1', name: 'Áo', sku: null, options: [] }],
        truncated: false,
      })) as never,
    });
    const stats = await runKbSync(
      tx,
      { workspaceId: WS },
      { ops, resolveEmbedding: async () => mlConfig },
    );
    expect(stats.sources).toBe(3);
    const byKind = new Map(
      (ops.setTopics as ReturnType<typeof vi.fn>).mock.calls.map((c) => [
        c[2],
        c[3].map((t: { topic: string }) => t.topic),
      ]),
    );
    expect(byKind.get('src-faq')).toEqual(['warranty']);
    expect(byKind.get('src-shop')).toEqual(['other']);
    expect(byKind.get('src-product')).toEqual(['product_info']);
  });

  it('có bộ hàm mặc định đầy đủ (hàm thật của @flow/db)', () => {
    expect(Object.values(defaultKbSyncOps).every((fn) => typeof fn === 'function')).toBe(true);
  });
});

describe('markDraftConflicts', () => {
  it('gom đoạn nháp mâu thuẫn rồi ghi cờ; không mâu thuẫn → 0 nhóm', async () => {
    const db = await import('@flow/db/runtime');
    const list = vi.spyOn(db, 'listDraftChunkTexts').mockResolvedValue([]);
    const mark = vi.spyOn(db, 'setDraftConflictMarks').mockResolvedValue(undefined);
    expect(await markDraftConflicts(tx, WS)).toBe(0);
    list.mockResolvedValue([
      {
        chunkKey: 'policy:a:0#0',
        content: 'Giao 2 ngày.',
        contextHeader: 'A',
        sourceTitle: 'S',
        topic: 'shipping_time',
      },
      {
        chunkKey: 'policy:b:0#0',
        content: 'Giao 5 ngày.',
        contextHeader: 'B',
        sourceTitle: 'S',
        topic: 'shipping_time',
      },
    ]);
    expect(await markDraftConflicts(tx, WS)).toBe(1);
    expect(mark).toHaveBeenLastCalledWith(tx, WS, [
      {
        group: 'shipping_time:ngày',
        values: ['2 ngày', '5 ngày'],
        chunkKeys: ['policy:a:0#0', 'policy:b:0#0'],
      },
    ]);
    vi.restoreAllMocks();
  });
});

describe('runKbSync — vector TÊN sản phẩm (1b): sản phẩm chưa có vector ở model hiện hành được nhúng', () => {
  it('nhúng đúng các sản phẩm còn thiếu, ghi kèm model, thống kê số đã nhúng', async () => {
    const batches = [
      [
        { id: 'p1', name: 'Áo thun basic' },
        { id: 'p2', name: 'Quần jean' },
      ],
      [],
    ];
    const listProductNamesToEmbed = vi.fn(async () => batches.shift() ?? []);
    const writeProductNameVectors = vi.fn(async (_t, _w, _m, rows: unknown[]) => rows.length);
    const { ops } = fakeOps({
      listProductNamesToEmbed: listProductNamesToEmbed as never,
      writeProductNameVectors: writeProductNameVectors as never,
    });
    const stats = await runKbSync(
      tx,
      { workspaceId: WS },
      { ops, resolveEmbedding: async () => mlConfig },
    );
    expect(stats.productNamesEmbedded).toBe(2);
    expect(listProductNamesToEmbed.mock.calls[0]?.slice(1, 3)).toEqual([WS, 'm']);
    const call = writeProductNameVectors.mock.calls[0] as unknown[];
    expect(call.slice(1, 3)).toEqual([WS, 'm']);
    expect(
      (call[3] as Array<{ id: string; name: string; embedding: number[] }>).map((r) => [
        r.id,
        r.name,
      ]),
    ).toEqual([
      ['p1', 'Áo thun basic'],
      ['p2', 'Quần jean'],
    ]);
    expect((call[3] as Array<{ embedding: number[] }>)[0]?.embedding).toHaveLength(1024);
  });

  it('không còn sản phẩm thiếu vector → không ghi, thống kê 0', async () => {
    const { ops } = fakeOps();
    const stats = await runKbSync(
      tx,
      { workspaceId: WS },
      { ops, resolveEmbedding: async () => mlConfig },
    );
    expect(stats.productNamesEmbedded).toBe(0);
    expect(ops.writeProductNameVectors).not.toHaveBeenCalled();
  });
});
