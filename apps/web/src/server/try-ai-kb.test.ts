import { createDemoKnowledge, createTryQuota } from '@flow/ai';
import { describe, expect, it, vi } from 'vitest';
import { createTryAiAction } from './try-ai';

const session = { workspaceId: 'ws1' };
const now = () => new Date('2026-11-06T10:00:00Z');

describe('FR-059 KB-TRYAI: nguồn kiến thức của hành động Thử AI', () => {
  it('mặc định (không runner) → knowledge = demo', async () => {
    const run = createTryAiAction({ quota: createTryQuota({ limit: 3 }), now });
    const r = await run(session, 'ship về Hà Nội bao nhiêu');
    expect(r).toMatchObject({ ok: true, knowledge: 'demo' });
  });

  it('runner KB → pipeline dùng knowledge do runner đưa, trả knowledge = kb', async () => {
    const searchKb = vi.fn(async () => []);
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      knowledgeRunner: async (_s, base, fn) => ({
        value: await fn({ ...base, searchKb }, { productNames: [], abbreviations: {}, voices: {} }),
        source: 'kb',
        embedding: { state: 'ok', configuredModel: 'bge-m3', mismatches: [] },
      }),
    });
    const r = await run({ workspaceId: 'ws1', userId: 'u1' }, 'ship về Hà Nội bao nhiêu');
    expect(r).toMatchObject({ ok: true, knowledge: 'kb', embedding: { state: 'ok' } });
    expect(searchKb).toHaveBeenCalledTimes(1);
  });

  it('lệch model embedding → kết quả mang trạng thái mismatch để giao diện báo "chạy kb:reembed"', async () => {
    const mismatch = {
      state: 'mismatch' as const,
      configuredModel: 'bge-m3',
      mismatches: [{ source: 'kb_chunks' as const, model: 'fixture-trigram-1024', count: 3 }],
    };
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      knowledgeRunner: async (_s, base, fn) => ({
        value: await fn(base, { productNames: [], abbreviations: {}, voices: {} }),
        source: 'kb',
        embedding: mismatch,
      }),
    });
    const r = await run({ workspaceId: 'ws1', userId: 'u1' }, 'ship về Hà Nội bao nhiêu');
    expect(r).toMatchObject({ ok: true, embedding: mismatch });
  });

  it('runner ném lỗi → unavailable, không lộ nội dung', async () => {
    const warn = vi.fn();
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      knowledgeRunner: async () => {
        throw new Error('db down 0912345678');
      },
      warn,
    });
    expect(await run(session, 'ship')).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('0912345678');
  });

  it('base đưa cho runner là knowledge của buildDeps', async () => {
    const base = createDemoKnowledge();
    let seen: unknown;
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: () => ({
        extractor: {
          extract: async () => {
            throw new Error('x');
          },
        },
        drafter: {
          draft: async () => {
            throw new Error('x');
          },
        },
        knowledge: base,
      }),
      knowledgeRunner: async (_s, b) => {
        seen = b;
        throw new Error('stop');
      },
      warn: () => {},
    });
    await run(session, 'xin chào');
    expect(seen).toBe(base);
  });
});
