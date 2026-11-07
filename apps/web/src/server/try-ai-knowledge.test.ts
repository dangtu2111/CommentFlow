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
    expect(out).toEqual({ value: true, source: 'demo' });
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
    expect(out).toEqual({ value: 1, source: 'demo' });
  });

  it('cờ BẬT + có phiên bản → chạy trong withActor, nguồn kb', async () => {
    const withActor = vi.fn(async (_w: string, _u: string, fn: (tx: never) => Promise<unknown>) =>
      fn({} as never),
    );
    const runner = createKnowledgeRunner({
      enabled: true,
      db: { withActor: withActor as never },
      currentVersion: async () => ({ id: 'v1', number: 1 }),
    });
    const base = createDemoKnowledge();
    const out = await runner({ workspaceId: 'w', userId: 'u' }, base, async (k) => k !== base);
    expect(out).toEqual({ value: true, source: 'kb' });
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
    });
    const base = createDemoKnowledge();
    const out = await runner({ workspaceId: 'w', userId: 'u' }, base, async (k, ctx) => ({
      names: ctx.productNames,
      sameBase: k === base,
      usesDemoKb: k.searchKb === base.searchKb,
    }));
    expect(out.source).toBe('shop');
    expect(out.value).toEqual({ names: ['Áo A', 'Váy B'], sameBase: false, usesDemoKb: false });
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
    expect(out).toEqual({ value: 1, source: 'demo' });
  });

  it('isTryAiProductsReal: mặc định BẬT, chỉ tắt khi đúng "false"', () => {
    expect(isTryAiProductsReal({})).toBe(true);
    expect(isTryAiProductsReal({ TRY_AI_PRODUCTS_REAL: 'false' })).toBe(false);
    expect(isTryAiProductsReal({ TRY_AI_PRODUCTS_REAL: 'true' })).toBe(true);
  });
});
