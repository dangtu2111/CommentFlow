import { createDemoKnowledge } from '@flow/ai';
import { describe, expect, it, vi } from 'vitest';
import { createKnowledgeRunner, isTryAiKbReal, isTryAiProductsReal } from './try-ai-knowledge';

describe('KB-TRYAI cờ + runner', () => {
  it('cờ chỉ bật khi đúng "true"', () => {
    expect(isTryAiKbReal({})).toBe(false);
    expect(isTryAiKbReal({ TRY_AI_KB_REAL: 'false' })).toBe(false);
    expect(isTryAiKbReal({ TRY_AI_KB_REAL: '1' })).toBe(false);
    expect(isTryAiKbReal({ TRY_AI_KB_REAL: 'true' })).toBe(true);
  });

  it('cờ TẮT → không đụng DB, nguồn demo', async () => {
    const withActor = vi.fn();
    const runner = createKnowledgeRunner({ enabled: false, db: { withActor } });
    const base = createDemoKnowledge();
    const out = await runner({ workspaceId: 'w', userId: 'u' }, base, async (k) => k === base);
    expect(out).toMatchObject({ value: true, source: 'demo' });
    expect(withActor).not.toHaveBeenCalled();
  });

  it('cờ BẬT nhưng thiếu userId → demo', async () => {
    const withActor = vi.fn();
    const runner = createKnowledgeRunner({ enabled: true, db: { withActor } });
    const out = await runner({ workspaceId: 'w' }, createDemoKnowledge(), async () => 1);
    expect(out.source).toBe('demo');
    expect(withActor).not.toHaveBeenCalled();
  });

  it('cờ BẬT, chưa có phiên bản xuất bản → demo', async () => {
    const runner = createKnowledgeRunner({
      enabled: true,
      db: { withActor: async (_w, _u, fn) => fn({} as never) },
      currentVersion: async () => null,
    });
    const out = await runner(
      { workspaceId: 'w', userId: 'u' },
      createDemoKnowledge(),
      async () => 1,
    );
    expect(out).toMatchObject({ value: 1, source: 'demo' });
  });

  it('cờ BẬT + có phiên bản → chạy trong withActor, nguồn kb', async () => {
    const withActor = vi.fn(async (_w: string, _u: string, fn: (tx: never) => Promise<unknown>) =>
      fn({} as never),
    );
    const runner = createKnowledgeRunner({
      enabled: true,
      db: { withActor: withActor as never },
      currentVersion: async () => ({ id: 'v1', number: 1 }),
      abbreviations: async () => ({}),
      brandVoices: async () => [],
    });
    const base = createDemoKnowledge();
    const out = await runner({ workspaceId: 'w', userId: 'u' }, base, async (k) => k !== base);
    expect(out).toMatchObject({ value: true, source: 'kb' });
    expect(withActor).toHaveBeenCalledWith('w', 'u', expect.any(Function));
  });
  it('chỉ bật sản phẩm thật + workspace có sản phẩm → nguồn shop, kèm tên sản phẩm', async () => {
    const runner = createKnowledgeRunner({
      enabled: false,
      productsEnabled: true,
      db: { withActor: async (_w, _u, fn) => fn({} as never) },
      countProducts: async () => 3,
      shopTexts: async () => [],
      productNames: async () => ['Áo A', 'Váy B'],
      abbreviations: async () => ({ bn: 'bao nhiêu' }),
      brandVoices: async () => [],
    });
    const base = createDemoKnowledge();
    const out = await runner({ workspaceId: 'w', userId: 'u' }, base, async (k, ctx) => ({
      names: ctx.productNames,
      abbreviations: ctx.abbreviations,
      sameBase: k === base,
      usesDemoKb: k.searchKb === base.searchKb,
    }));
    expect(out.source).toBe('shop');
    expect(out.value).toEqual({
      names: ['Áo A', 'Váy B'],
      abbreviations: { bn: 'bao nhiêu' },
      sameBase: false,
      usesDemoKb: false,
    });
  });

  it('nguồn shop: brand_voice thật của workspace theo ngôn ngữ được đưa vào ngữ cảnh; dòng hỏng bị bỏ', async () => {
    const runner = createKnowledgeRunner({
      enabled: false,
      productsEnabled: true,
      db: { withActor: async (_w, _u, fn) => fn({} as never) },
      countProducts: async () => 1,
      shopTexts: async () => [],
      productNames: async () => ['Áo A'],
      abbreviations: async () => ({}),
      brandVoices: async () => [
        {
          lang: 'vi',
          tone: 'thân thiện',
          greeting: null,
          signOff: null,
          doRules: ['Báo giá đúng'],
          dontRules: [],
          shopPronoun: 'shop',
          shopPronounCustom: null,
          customerAddress: 'ban',
        },
        {
          lang: 'en',
          tone: null,
          greeting: null,
          signOff: null,
          doRules: [],
          dontRules: [],
          shopPronoun: 'shop',
          shopPronounCustom: null,
          customerAddress: 'ban', // không hợp lệ cho tiếng Anh → bị bỏ
        },
      ],
    });
    const out = await runner(
      { workspaceId: 'w', userId: 'u' },
      createDemoKnowledge(),
      async (_k, ctx) => ctx.voices,
    );
    expect(out.source).toBe('shop');
    expect(Object.keys(out.value)).toEqual(['vi']);
    expect(out.value.vi).toMatchObject({
      tone: 'thân thiện',
      do: ['Báo giá đúng'],
      customerAddress: 'ban',
    });
  });

  it('nguồn demo: không đọc brand_voice (voices rỗng)', async () => {
    const runner = createKnowledgeRunner({
      enabled: false,
      db: { withActor: async (_w, _u, fn) => fn({} as never) },
    });
    const out = await runner(
      { workspaceId: 'w' },
      createDemoKnowledge(),
      async (_k, ctx) => ctx.voices,
    );
    expect(out).toMatchObject({ value: {}, source: 'demo' });
  });

  it('bật sản phẩm thật nhưng workspace chưa có sản phẩm → demo', async () => {
    const runner = createKnowledgeRunner({
      enabled: false,
      productsEnabled: true,
      db: { withActor: async (_w, _u, fn) => fn({} as never) },
      countProducts: async () => 0,
      shopTexts: async () => [],
    });
    const out = await runner(
      { workspaceId: 'w', userId: 'u' },
      createDemoKnowledge(),
      async () => 1,
    );
    expect(out).toMatchObject({ value: 1, source: 'demo' });
  });

  it('isTryAiProductsReal: mặc định BẬT, chỉ tắt khi đúng "false"', () => {
    expect(isTryAiProductsReal({})).toBe(true);
    expect(isTryAiProductsReal({ TRY_AI_PRODUCTS_REAL: 'false' })).toBe(false);
    expect(isTryAiProductsReal({ TRY_AI_PRODUCTS_REAL: 'true' })).toBe(true);
  });
});

describe('FR-133 runner: cấu hình embedding từ DB, suy giảm khi không có/lỗi (không mock)', () => {
  const withActor = (async (_w: string, _u: string, fn: (tx: never) => Promise<unknown>) =>
    fn({} as never)) as never;
  const common = {
    enabled: true,
    db: { withActor },
    currentVersion: async () => ({ id: 'v1', number: 1 }),
    abbreviations: async () => ({}),
    brandVoices: async () => [],
    embeddingCounts: async () => ({ chunks: [{ model: 'bge-m3', count: 2 }], products: [] }),
  };
  const run = (opts: Parameters<typeof createKnowledgeRunner>[0]) =>
    createKnowledgeRunner(opts)(
      { workspaceId: 'w', userId: 'u' },
      createDemoKnowledge(),
      async () => 1,
    );
  const fakeEmbedder = { model: 'bge-m3', dimensions: 1024, embed: async () => [] } as never;

  it('model hoạt động + dịch vụ → nhánh vector bật (vector.off = null), trạng thái ok', async () => {
    const out = await run({
      ...common,
      resolveEmbedding: async () => ({
        config: {
          kind: 'ml',
          model: 'bge-m3',
          embedder: fakeEmbedder,
          describe: { kind: 'ml', model: 'bge-m3', note: '' },
        },
        revision: 3,
      }),
    });
    expect(out.vector).toEqual({ off: null, failed: false });
    expect(out.embedding.state).toBe('ok');
  });

  it('DB chưa kích hoạt model / dịch vụ tắt → vector.off nêu lý do, không có nhánh vector', async () => {
    for (const reason of ['no_active_model', 'service_disabled'] as const) {
      const out = await run({
        ...common,
        resolveEmbedding: async () => ({
          config: {
            kind: 'off',
            reason,
            model: null,
            embedder: null,
            describe: { kind: 'off', model: null, note: '' },
          },
          revision: 1,
        }),
      });
      expect(out.vector.off).toBe(reason);
      expect(out.embedding.state).toBe('off');
    }
  });

  it('không đọc được trạng thái embedding ở DB → suy giảm (unreadable) + ghi nhận sự cố, lượt vẫn chạy', async () => {
    const onEmbeddingFailure = vi.fn();
    const out = await run({
      ...common,
      resolveEmbedding: async () => {
        throw new Error('db down');
      },
      onEmbeddingFailure,
    });
    expect(out.value).toBe(1);
    expect(out.vector.off).toBe('unreadable');
    expect(onEmbeddingFailure).toHaveBeenCalledTimes(1);
  });
});
