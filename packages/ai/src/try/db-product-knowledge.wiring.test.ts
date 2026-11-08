import type { Database, TryProduct } from '@flow/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findProductMatch = vi.fn();
const loadTryProducts = vi.fn();

vi.mock('@flow/db/runtime', () => ({
  findProductMatch: (...args: unknown[]) => findProductMatch(...args),
  loadTryProducts: (...args: unknown[]) => loadTryProducts(...args),
}));

const { createDbProductKnowledge } = await import('./db-product-knowledge');
const { createDbShopKnowledgeSearch } = await import('./db-shop-knowledge');

const tx = {} as Database;
const shirt: TryProduct = {
  id: 'p1',
  name: 'Áo thun',
  priceVnd: 150000,
  stock: 3,
  variants: [
    { attrs: { Size: 'M' }, attrsNorm: { size: 'm' }, priceVnd: 150000, stock: 3 },
    { attrs: { Size: 'L' }, attrsNorm: { size: 'l' }, priceVnd: 150000, stock: 0 },
  ],
};

beforeEach(() => {
  findProductMatch.mockReset();
  loadTryProducts.mockReset();
});

describe('TRY-AI-REAL createDbProductKnowledge (nối DB, hàm DB được giả lập)', () => {
  it('matched → trả đúng sản phẩm và trục biến thể còn thiếu; bỏ qua lời nhắc rỗng', async () => {
    findProductMatch.mockResolvedValue({ status: 'matched', id: 'p1', score: 0.9 });
    loadTryProducts.mockResolvedValue([shirt]);
    const knowledge = createDbProductKnowledge(tx, 'ws1');
    const result = await knowledge.matchProducts(['áo thun', '   ']);
    expect(result).toEqual({ ids: ['p1'], names: ['Áo thun'], missingAxes: ['size'] });
    expect(findProductMatch).toHaveBeenCalledTimes(1);
    expect(findProductMatch).toHaveBeenCalledWith(tx, { workspaceId: 'ws1', queryText: 'áo thun' });
    expect(loadTryProducts).toHaveBeenCalledWith(tx, 'ws1', ['p1']);
  });

  it('mơ hồ → giữ mọi ứng viên, không chọn trục (để AI hỏi lại); không khớp → rỗng', async () => {
    findProductMatch
      .mockResolvedValueOnce({ status: 'ambiguous', ids: ['p1', 'p2'] })
      .mockResolvedValueOnce({ status: 'none', reason: 'below_threshold' });
    loadTryProducts.mockResolvedValue([shirt, { ...shirt, id: 'p2', name: 'Áo sơ mi' }]);
    const knowledge = createDbProductKnowledge(tx, 'ws1');
    const ambiguous = await knowledge.matchProducts(['áo']);
    expect(ambiguous.ids).toEqual(['p1', 'p2']);
    expect(ambiguous.missingAxes).toEqual([]);

    loadTryProducts.mockResolvedValue([]);
    expect(await knowledge.matchProducts(['xyz'])).toEqual({ ids: [], names: [], missingAxes: [] });
  });

  it('sản phẩm chưa có giá (tiền tệ khác VND) → nguồn đánh dấu priceUnknown; có giá thì không', async () => {
    const noPrice: TryProduct = {
      ...shirt,
      id: 'p9',
      priceVnd: null,
      variants: shirt.variants.map((v) => ({ ...v, priceVnd: null })),
    };
    loadTryProducts.mockResolvedValue([noPrice, shirt]);
    const knowledge = createDbProductKnowledge(tx, 'ws1');
    const facts = await knowledge.lookupProductFacts(['p9', 'p1']);
    expect(facts[0]).toMatchObject({ id: 'p9', priceUnknown: true });
    expect(facts[0]?.text).toContain('chưa có giá');
    expect(facts[1]?.priceUnknown).toBeUndefined();
  });

  it('Q-SFP1 sản phẩm có giá ngoại tệ → KHÔNG đánh dấu priceUnknown và đánh dấu foreignPrice (chặn tự gửi)', async () => {
    const usd: TryProduct = {
      ...shirt,
      id: 'u1',
      priceVnd: null,
      currencyCode: 'USD',
      priceMinor: 1299,
      variants: shirt.variants.map((v) => ({
        ...v,
        priceVnd: null,
        currencyCode: 'USD',
        priceMinor: 1299,
      })),
    };
    loadTryProducts.mockResolvedValue([usd, shirt]);
    const knowledge = createDbProductKnowledge(tx, 'ws1');
    const facts = await knowledge.lookupProductFacts(['u1', 'p1']);
    expect(facts[0]?.text).toContain('12.99 USD');
    expect(facts[0]?.priceUnknown).toBeUndefined();
    expect(facts[0]?.foreignPrice).toBe(true);
    expect(facts[1]?.foreignPrice).toBeUndefined();
  });

  it('lookupProductFacts → nguồn kiểu product, câu nguồn lấy từ dữ liệu', async () => {
    loadTryProducts.mockResolvedValue([shirt]);
    const knowledge = createDbProductKnowledge(tx, 'ws1');
    const [candidate] = await knowledge.lookupProductFacts(['p1']);
    expect(candidate).toMatchObject({ id: 'p1', kind: 'product', title: 'Áo thun', score: 1 });
    expect(String(candidate?.text)).toContain('giá 150.000đ');
    expect(String(candidate?.text)).toContain('Size L giá 150.000đ hết hàng');
  });
});

describe('Q-POR12 resolveProducts — nhận sản phẩm theo id (lượt trước / gắn bài)', () => {
  it('một sản phẩm → trục biến thể còn thiếu; nhiều sản phẩm → không chọn trục; không có → rỗng', async () => {
    const knowledge = createDbProductKnowledge(tx, 'ws1');
    loadTryProducts.mockResolvedValue([shirt]);
    expect(await knowledge.resolveProducts?.(['p1'])).toEqual({
      ids: ['p1'],
      names: ['Áo thun'],
      missingAxes: ['size'],
    });
    expect(loadTryProducts).toHaveBeenCalledWith(tx, 'ws1', ['p1']);
    loadTryProducts.mockResolvedValue([shirt, { ...shirt, id: 'p2', name: 'Áo sơ mi' }]);
    expect((await knowledge.resolveProducts?.(['p1', 'p2']))?.missingAxes).toEqual([]);
    loadTryProducts.mockResolvedValue([]);
    expect(await knowledge.resolveProducts?.(['gone'])).toEqual({
      ids: [],
      names: [],
      missingAxes: [],
    });
  });
});

describe('TRY-AI-REAL createDbShopKnowledgeSearch', () => {
  it('bọc searchShopTexts thành cổng searchKb async', async () => {
    const search = createDbShopKnowledgeSearch([
      {
        id: 'a',
        kind: 'policy',
        policyKind: 'shipping',
        lang: 'all',
        title: 'Shipping',
        text: 'Orders ship within 3 days.',
      },
    ]);
    const hits = await search('Phí ship bao nhiêu?', { lang: 'vi', productIds: [] });
    expect(hits.map((hit) => hit.id.split('.')[0])).toEqual(['policy:a']);
  });
});

describe('(1b) khớp sản phẩm LAI: vector tên đi kèm khi có embedder', () => {
  const embedder = { model: 'bge-m3-test', embed: vi.fn() };
  beforeEach(() => {
    embedder.embed.mockReset(); // không trả mock ra ngoài: vitest sẽ coi hàm trả về là bước dọn và gọi nó
  });

  it('có embedder → nhúng từng lời nhắc và truyền queryVector + model cho findProductMatch', async () => {
    embedder.embed.mockResolvedValue([[0.1, 0.2]]);
    findProductMatch.mockResolvedValue({ status: 'matched', id: 'p1', score: 0.8 });
    loadTryProducts.mockResolvedValue([shirt]);
    const knowledge = createDbProductKnowledge(tx, 'ws1', { embedder });
    await knowledge.matchProducts(['sơ mi trắng']);
    expect(embedder.embed).toHaveBeenCalledWith(['sơ mi trắng']);
    expect(findProductMatch).toHaveBeenCalledWith(tx, {
      workspaceId: 'ws1',
      queryText: 'sơ mi trắng',
      queryVector: [0.1, 0.2],
      embeddingModel: 'bge-m3-test',
    });
  });

  it('embedder lỗi → suy giảm về trigram (không ném), báo onEmbeddingFailure một lần, không kèm nội dung', async () => {
    embedder.embed.mockImplementation(async () => {
      throw new Error('boom');
    });
    findProductMatch.mockResolvedValue({ status: 'matched', id: 'p1', score: 0.8 });
    loadTryProducts.mockResolvedValue([shirt]);
    const onEmbeddingFailure = vi.fn();
    const knowledge = createDbProductKnowledge(tx, 'ws1', { embedder, onEmbeddingFailure });
    const result = await knowledge.matchProducts(['áo thun']);
    expect(result.ids).toEqual(['p1']);
    expect(findProductMatch).toHaveBeenCalledWith(tx, { workspaceId: 'ws1', queryText: 'áo thun' });
    expect(onEmbeddingFailure).toHaveBeenCalledTimes(1);
  });
});
