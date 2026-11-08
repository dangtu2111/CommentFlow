import { createDemoKnowledge, createTryQuota } from '@flow/ai';
import { describe, expect, it, vi } from 'vitest';
import { createTryAiAction } from './try-ai';
import { NoKnowledgeError } from './try-ai-knowledge';

const session = { workspaceId: 'ws1' };
const now = () => new Date('2026-11-06T10:00:00Z');

import { demoBuildDeps, demoKnowledgeRunner } from './test-demo-wiring';

describe('FR-059 KB-TRYAI: nguồn kiến thức của hành động Thử AI', () => {
  it('KHÔNG có LLM thật → llm_not_configured, không tốn lượt, không chạy bản mẫu', async () => {
    const quota = createTryQuota({ limit: 1 });
    const run = createTryAiAction({ quota, now, knowledgeRunner: demoKnowledgeRunner });
    expect(await run(session, 'ship về Hà Nội bao nhiêu')).toEqual({
      ok: false,
      reason: 'llm_not_configured',
    });
    expect(await run(session, 'ship về Hà Nội bao nhiêu')).toEqual({
      ok: false,
      reason: 'llm_not_configured',
    }); // lượt thử chưa bị trừ
  });

  it('có LLM nhưng không có nguồn kiến thức (không runner) → no_knowledge, không chạy kiến thức mẫu', async () => {
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: demoBuildDeps,
    });
    expect(await run(session, 'ship về Hà Nội bao nhiêu')).toEqual({
      ok: false,
      reason: 'no_knowledge',
    });
  });

  it('runner báo workspace chưa có dữ liệu thật (NoKnowledgeError) → no_knowledge', async () => {
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: demoBuildDeps,
      knowledgeRunner: async () => {
        throw new NoKnowledgeError();
      },
    });
    expect(await run({ workspaceId: 'ws1', userId: 'u1' }, 'ship')).toEqual({
      ok: false,
      reason: 'no_knowledge',
    });
  });

  it('runner KB → pipeline dùng knowledge do runner đưa, trả knowledge = kb', async () => {
    const searchKb = vi.fn(async () => []);
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: demoBuildDeps,
      knowledgeRunner: async (_s, base, fn) => ({
        value: await fn({ ...base, searchKb }, { productNames: [], abbreviations: {}, voices: {} }),
        source: 'kb',
        embedding: { state: 'ok', configuredModel: 'bge-m3', mismatches: [] },
        vector: { off: null, failed: false },
      }),
    });
    const r = await run({ workspaceId: 'ws1', userId: 'u1' }, 'ship về Hà Nội bao nhiêu');
    expect(r).toMatchObject({ ok: true, knowledge: 'kb', embedding: { state: 'ok' } });
    expect(searchKb).toHaveBeenCalledTimes(1);
  });

  it('lệch model embedding → kết quả mang trạng thái mismatch để giao diện báo "chạy kb:switch-embedding"', async () => {
    const mismatch = {
      state: 'mismatch' as const,
      configuredModel: 'bge-m3',
      mismatches: [{ source: 'kb_chunks' as const, model: 'fixture-trigram-1024', count: 3 }],
    };
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      buildDeps: demoBuildDeps,
      knowledgeRunner: async (_s, base, fn) => ({
        value: await fn(base, { productNames: [], abbreviations: {}, voices: {} }),
        source: 'kb',
        embedding: mismatch,
        vector: { off: null, failed: false },
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
      buildDeps: demoBuildDeps,
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
