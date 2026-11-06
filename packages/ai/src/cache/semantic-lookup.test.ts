import { AppError } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureEmbedder } from '../embedding';
import type { CachedAnswer } from './exact-cache';
import {
  buildSemanticNamespace,
  cosineSimilarity,
  createMemorySemanticStore,
  lookupSemanticCache,
  type SemanticCacheDeps,
  type SemanticLookupInput,
  storeSemanticCache,
} from './semantic-lookup';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';

const input = (over: Partial<SemanticLookupInput> = {}): SemanticLookupInput => ({
  workspaceId: WS_A,
  postId: 'post-1',
  kbVersion: 3,
  lang: 'vi',
  normalizedText: 'ao nay con size m khong shop',
  ...over,
});

const answer = (over: Partial<CachedAnswer> = {}): CachedAnswer => ({
  reply: 'Dạ áo còn size M ạ.',
  variants: [],
  lang: 'vi',
  sourceIds: ['s1'],
  cacheable: true,
  ...over,
});

function makeDeps(over: Partial<SemanticCacheDeps> = {}): SemanticCacheDeps {
  return {
    store: createMemorySemanticStore(),
    embedder: createFixtureEmbedder(),
    enabled: true,
    ...over,
  };
}

describe('FR-026 buildSemanticNamespace (khóa semantic cache)', () => {
  it('chứa workspace_id, kb_version và bài', () => {
    expect(buildSemanticNamespace(input())).toBe(`cf:${WS_A}:cache:semantic:3:post-1`);
    expect(buildSemanticNamespace(input({ postId: null }))).toBe(`cf:${WS_A}:cache:semantic:3:-`);
  });
  it('workspace/bài/kb_version khác → namespace khác (property)', () => {
    fc.assert(
      fc.property(fc.nat(50), fc.nat(50), (a, b) => {
        fc.pre(a !== b);
        expect(buildSemanticNamespace(input({ kbVersion: a }))).not.toBe(
          buildSemanticNamespace(input({ kbVersion: b })),
        );
      }),
    );
    expect(buildSemanticNamespace(input({ workspaceId: WS_B }))).not.toBe(
      buildSemanticNamespace(input()),
    );
    expect(buildSemanticNamespace(input({ postId: 'post-2' }))).not.toBe(
      buildSemanticNamespace(input()),
    );
  });
  it('đầu vào sai → VALIDATION_FAILED', () => {
    for (const bad of [
      input({ workspaceId: 'x' }),
      input({ kbVersion: -1 }),
      input({ kbVersion: 1.5 }),
      input({ postId: 'a b/c' }),
      input({ normalizedText: '  ' }),
    ]) {
      expect(() => buildSemanticNamespace(bad)).toThrow(AppError);
    }
  });
});

describe('FR-026 cosineSimilarity', () => {
  it('đối xứng và không đổi theo tỉ lệ vector (property)', () => {
    const vec = fc.array(fc.double({ min: 0.1, max: 10, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    });
    fc.assert(
      fc.property(vec, vec, fc.double({ min: 0.5, max: 5, noNaN: true }), (a, b, k) => {
        expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 9);
        expect(
          cosineSimilarity(
            a.map((x) => x * k),
            b,
          ),
        ).toBeCloseTo(cosineSimilarity(a, b), 6);
      }),
    );
  });
  it('giống nhau = 1; vuông góc = 0; vector 0/lệch chiều/rỗng = 0', () => {
    expect(cosineSimilarity([1, 2], [1, 2])).toBeCloseTo(1, 9);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

/** Embedder giả có vector cố định theo câu — để điều khiển độ giống chính xác (mock trigram không đủ mịn). */
function tableEmbedder(table: Record<string, number[]>) {
  return {
    model: 'table-test',
    embed: async (texts: string[]) => texts.map((t) => table[t] ?? [0, 0, 1]),
  };
}

const GENERIC = 'shop mo cua luc may gio';
const GENERIC_NEAR = 'shop mo cua may gio vay';

describe('FR-026 lookupSemanticCache / storeSemanticCache', () => {
  it('trúng khi cùng câu', async () => {
    const deps = makeDeps();
    expect(await storeSemanticCache(deps, input(), answer(), {})).toEqual({ stored: true });
    const same = await lookupSemanticCache(deps, input());
    expect(same.status).toBe('hit');
    if (same.status === 'hit') expect(same.similarity).toBeGreaterThanOrEqual(0.99);
  });

  it('đúng ngưỡng vẫn trúng, dưới ngưỡng → below_threshold (ca biên)', async () => {
    const embedder = tableEmbedder({
      [GENERIC]: [1, 0, 0],
      [GENERIC_NEAR]: [0.9, Math.sqrt(1 - 0.81), 0],
    });
    const deps = makeDeps({ embedder });
    await storeSemanticCache(deps, input({ normalizedText: GENERIC }), answer(), {});
    const q = input({ normalizedText: GENERIC_NEAR });
    const sim = cosineSimilarity([1, 0, 0], [0.9, Math.sqrt(1 - 0.81), 0]);
    expect((await lookupSemanticCache({ ...deps, threshold: sim }, q)).status).toBe('hit');
    expect(await lookupSemanticCache({ ...deps, threshold: sim + 1e-9 }, q)).toEqual({
      status: 'miss',
      reason: 'below_threshold',
    });
    expect(await lookupSemanticCache(deps, q)).toEqual({
      status: 'miss',
      reason: 'below_threshold',
    });
  });

  it('không tin điểm do store trả: tự tính lại cosine', async () => {
    const embedder = tableEmbedder({ [GENERIC]: [1, 0, 0], [GENERIC_NEAR]: [0, 1, 0] });
    const real = createMemorySemanticStore();
    const lying = {
      ...real,
      nearest: async (ns: string, e: readonly number[]) => {
        const found = await real.nearest(ns, e);
        return found && { ...found, similarity: 1 };
      },
    };
    const deps = makeDeps({ embedder, store: lying });
    await storeSemanticCache(deps, input({ normalizedText: GENERIC }), answer(), {});
    expect(await lookupSemanticCache(deps, input({ normalizedText: GENERIC_NEAR }))).toEqual({
      status: 'miss',
      reason: 'below_threshold',
    });
  });

  it('ngưỡng ngoài [0,85; 1] → VALIDATION_FAILED', async () => {
    for (const threshold of [0, 0.5, 0.849, 1.01, Number.NaN]) {
      await expect(lookupSemanticCache(makeDeps({ threshold }), input())).rejects.toThrow(AppError);
    }
  });

  it('cờ tắt → không embed, không đụng store', async () => {
    const embedder = createFixtureEmbedder();
    const embed = vi.spyOn(embedder, 'embed');
    const deps = makeDeps({ enabled: false, embedder });
    expect(await lookupSemanticCache(deps, input())).toEqual({
      status: 'miss',
      reason: 'disabled',
    });
    expect(await storeSemanticCache(deps, input(), answer(), {})).toEqual({
      stored: false,
      reason: 'disabled',
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it('không lẫn workspace, bài, kb_version', async () => {
    const deps = makeDeps();
    await storeSemanticCache(deps, input(), answer(), {});
    for (const other of [
      input({ workspaceId: WS_B }),
      input({ postId: 'post-2' }),
      input({ kbVersion: 4 }),
    ]) {
      expect(await lookupSemanticCache(deps, other)).toEqual({ status: 'miss', reason: 'absent' });
    }
  });

  it('tin nhắn riêng (postId null) không dùng semantic cache', async () => {
    const deps = makeDeps();
    expect(await storeSemanticCache(deps, input({ postId: null }), answer(), {})).toEqual({
      stored: false,
      reason: 'private_message',
    });
    expect(await lookupSemanticCache(deps, input({ postId: null }))).toEqual({
      status: 'miss',
      reason: 'not_applicable',
    });
  });

  it('khác ngôn ngữ → miss', async () => {
    const deps = makeDeps();
    await storeSemanticCache(deps, input(), answer(), {});
    expect(await lookupSemanticCache(deps, input({ lang: 'en' }))).toEqual({
      status: 'miss',
      reason: 'lang_mismatch',
    });
  });

  it('câu có số khác (size 38 vs 39) → number_mismatch dù vector y hệt', async () => {
    const embedder = tableEmbedder({ 'size 38': [1, 0, 0], 'size 39': [1, 0, 0] });
    const deps = makeDeps({ embedder });
    await storeSemanticCache(deps, input({ normalizedText: 'size 38' }), answer(), {});
    expect(await lookupSemanticCache(deps, input({ normalizedText: 'size 39' }))).toEqual({
      status: 'miss',
      reason: 'number_mismatch',
    });
    expect((await lookupSemanticCache(deps, input({ normalizedText: 'size 38' }))).status).toBe(
      'hit',
    );
  });

  it('hồi quy: giá áo đỏ không được trả cho câu hỏi áo xanh (câu có giá/dữ liệu sản phẩm không được ghi)', async () => {
    const embedder = tableEmbedder({
      'ao do gia bao nhieu': [1, 0, 0],
      'ao xanh gia bao nhieu': [1, 0, 0],
    });
    const deps = makeDeps({ embedder });
    const priced = answer({ reply: 'Áo này giá 250.000đ ạ.' });
    expect(
      await storeSemanticCache(deps, input({ normalizedText: 'ao do gia bao nhieu' }), priced, {
        p1: 7,
      }),
    ).toEqual({ stored: false, reason: 'product_specific' });
    expect(
      await storeSemanticCache(deps, input({ normalizedText: 'ao do gia bao nhieu' }), priced, {}),
    ).toEqual({ stored: false, reason: 'unverifiable_price' });
    expect(
      await lookupSemanticCache(deps, input({ normalizedText: 'ao xanh gia bao nhieu' })),
    ).toEqual({ status: 'miss', reason: 'absent' });
  });

  it('không ghi: dùng product_revs, có số/%/ngày, SĐT/email, cacheable=false', async () => {
    const deps = makeDeps();
    const cases: [Partial<CachedAnswer>, Record<string, number>, string][] = [
      [{}, { p1: 1 }, 'product_specific'],
      [{ reply: 'Giảm 20% hôm nay ạ.' }, {}, 'product_specific'],
      [{ reply: 'Còn 5 cái ạ.' }, {}, 'product_specific'],
      [{ reply: 'Ship ngày 12/11 ạ.' }, {}, 'product_specific'],
      [{ reply: 'Gọi 0912345678 nhé.' }, {}, 'personal_data'],
      [{ variants: ['mail a@b.co'] }, {}, 'personal_data'],
      [{ cacheable: false }, {}, 'not_cacheable'],
    ];
    for (const [over, revs, reason] of cases) {
      expect(await storeSemanticCache(deps, input(), answer(over), revs)).toEqual({
        stored: false,
        reason,
      });
    }
    expect((await lookupSemanticCache(deps, input())).status).toBe('miss');
  });

  it('không lưu số thô của khách trong giá trị cache', async () => {
    const store = createMemorySemanticStore();
    const deps = makeDeps({ store });
    await storeSemanticCache(deps, input({ normalizedText: 'don 987654 sao roi' }), answer(), {});
    const found = await store.nearest(
      buildSemanticNamespace(input()),
      (await deps.embedder.embed(['don 987654 sao roi']))[0] ?? [],
    );
    expect(found?.entry.value).not.toContain('987654');
  });

  it('mục hỏng → miss corrupt và xóa', async () => {
    const store = createMemorySemanticStore();
    const ns = buildSemanticNamespace(input());
    await store.put(ns, { id: 'x', embedding: [1, 0], value: '{bad' }, 60);
    const deps = makeDeps({ store, embedder: { model: 'm', embed: async () => [[1, 0]] } });
    expect(await lookupSemanticCache(deps, input())).toEqual({ status: 'miss', reason: 'corrupt' });
    expect(await store.nearest(ns, [1, 0])).toBeNull();
  });

  it('gọi onOutcome với kết quả tra cứu (đo tỉ lệ trúng)', async () => {
    const onOutcome = vi.fn();
    const deps = makeDeps({ onOutcome });
    await lookupSemanticCache(deps, input());
    await storeSemanticCache(deps, input(), answer(), {});
    await lookupSemanticCache(deps, input());
    expect(onOutcome.mock.calls.map((c) => c[0])).toEqual(['absent', 'hit']);
  });
});

describe('FR-026 createMemorySemanticStore', () => {
  it('chọn gần nhất trong đúng namespace, hết hạn theo TTL', async () => {
    let t = 0;
    const store = createMemorySemanticStore(() => t);
    await store.put('ns1', { id: 'a', embedding: [1, 0], value: 'A' }, 10);
    await store.put('ns1', { id: 'b', embedding: [0.9, 0.1], value: 'B' }, 10);
    await store.put('ns2', { id: 'c', embedding: [1, 0], value: 'C' }, 10);
    expect((await store.nearest('ns1', [0.8, 0.2]))?.entry.id).toBe('b');
    expect(await store.nearest('ns3', [1, 0])).toBeNull();
    t = 10_001;
    expect(await store.nearest('ns1', [1, 0])).toBeNull();
  });
});
