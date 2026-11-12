import {
  createDemoDrafter,
  createDemoExtractor,
  createDemoKnowledge,
  createTryQuota,
  type Extractor,
} from '@flow/ai';
import { AppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { demoKnowledgeRunner, demoWiring } from './test-demo-wiring';
import { createTryAiAction, TRY_AI_MAX_CHARS } from './try-ai';

const session = { workspaceId: 'ws1' };
const now = () => new Date('2026-11-06T10:00:00Z');

function action(limit = 5) {
  return createTryAiAction({ quota: createTryQuota({ limit }), now, ...demoWiring });
}

describe('FR-059 US-034 BR-03 Thử AI (mock): đầu vào, giới hạn/ngày, không trừ lượt', () => {
  it('chạy cả chuỗi bằng mock, billed=false', async () => {
    const r = await action()(session, 'ship về Hà Nội bao nhiêu');
    expect(r.ok).toBe(true);
    if (!r.ok || r.result.status !== 'done') throw new Error('expected done');
    expect(r.result.billed).toBe(false);
    expect(r.result.candidates[0]?.id).toBe('demo-kb-ship');
    expect(r.result.reply).toContain('20.000đ');
    expect(r.quota).toEqual({ used: 1, limit: 5 });
  });

  it('rỗng / quá dài / không phải chuỗi → từ chối, KHÔNG tốn lượt thử', async () => {
    const run = action(1);
    expect(await run(session, '   ')).toEqual({ ok: false, reason: 'empty' });
    expect(await run(session, 'x'.repeat(TRY_AI_MAX_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(await run(session, 42)).toEqual({ ok: false, reason: 'empty' });
    expect((await run(session, 'giá áo thun basic')).ok).toBe(true);
  });

  it('quá giới hạn/ngày → limit_reached, không chạy pipeline', async () => {
    const run = action(1);
    await run(session, 'ship');
    expect(await run(session, 'ship')).toEqual({ ok: false, reason: 'limit_reached' });
  });

  it('bình luận chỉ emoji → skipped, vẫn tính một lượt thử (không phải lượt gói)', async () => {
    const r = await action()(session, '😀😀');
    expect(r).toMatchObject({ ok: true, result: { status: 'skipped', billed: false } });
  });

  it('AppError trong pipeline → log mang MÃ lỗi (để chẩn đoán), không mang thông điệp/nội dung', async () => {
    const warn = vi.fn();
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      knowledgeRunner: demoKnowledgeRunner,
      buildDeps: () => ({
        extractor: {
          extract: async () => {
            throw new AppError('VALIDATION_FAILED', 'chi tiết 0912345678');
          },
        },
        drafter: { draft: async () => ({ reply: 'x' }) as never },
        knowledge: {
          matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
          lookupProductFacts: async () => [],
          searchKb: async () => [],
        },
      }),
      warn,
    });
    expect(await run(session, 'ship bao nhiêu')).toEqual({ ok: false, reason: 'unavailable' });
    expect(warn).toHaveBeenCalledWith({
      event: 'try_ai_failed',
      reason: 'AppError',
      code: 'VALIDATION_FAILED',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('0912345678');
  });

  it('LLM_UNAVAILABLE: log kèm thông điệp cố định của dịch vụ AI để biết hỏng ở bước nào', async () => {
    const warn = vi.fn();
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      knowledgeRunner: demoKnowledgeRunner,
      buildDeps: () => ({
        extractor: {
          extract: async () => {
            throw new AppError('LLM_UNAVAILABLE', 'Dịch vụ AI trả về lỗi HTTP 400.');
          },
        },
        drafter: { draft: async () => ({ reply: 'x' }) as never },
        knowledge: {
          matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
          lookupProductFacts: async () => [],
          searchKb: async () => [],
        },
      }),
      warn,
    });
    await run(session, 'ship bao nhiêu');
    expect(warn).toHaveBeenCalledWith({
      event: 'try_ai_failed',
      reason: 'AppError',
      code: 'LLM_UNAVAILABLE',
      message: 'Dịch vụ AI trả về lỗi HTTP 400.',
    });
  });

  it('lỗi bất ngờ trong pipeline → unavailable, không lộ nội dung', async () => {
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 3 }),
      now,
      knowledgeRunner: demoKnowledgeRunner,
      buildDeps: () => ({
        extractor: {
          extract: async () => {
            throw new Error('boom 0912345678');
          },
        },
        drafter: {
          draft: async () => {
            throw new Error('x');
          },
        },
        knowledge: {
          matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
          lookupProductFacts: async () => [],
          searchKb: async () => [],
        },
      }),
      warn: () => {},
    });
    expect(await run(session, 'xin chào shop')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('brand_voice thật trong ô Thử AI', () => {
  const run = async (voices: Record<string, unknown>) => {
    const seen: unknown[] = [];
    const base = createDemoKnowledge();
    const action = createTryAiAction({
      quota: createTryQuota({ limit: 5 }),
      now,
      llm: {
        extractor: createDemoExtractor(),
        drafter: {
          draft: async (input) => {
            seen.push(input.voice);
            return createDemoDrafter().draft(input);
          },
        },
      },
      knowledgeRunner: async (_s, knowledge, fn) => ({
        value: await fn(knowledge ?? base, {
          productNames: [],
          abbreviations: {},
          voices: voices as never,
        }),
        source: 'shop',
        embedding: { state: 'off', configuredModel: null, mismatches: [] },
        vector: { off: 'service_disabled', failed: false },
      }),
    });
    const r = await action(session, 'ship về Hà Nội bao nhiêu');
    return { r, seen };
  };

  it('có giọng của workspace cho ngôn ngữ nhận ra → bộ soạn nhận giọng đó, kết quả ghi voice=shop', async () => {
    const vi = {
      do: ['Báo giá đúng'],
      dont: [],
      shopPronoun: 'shop',
      customerAddress: 'ban',
      tone: 'thân thiện',
    };
    const { r, seen } = await run({ vi });
    expect(seen[0]).toEqual(vi);
    expect(r.ok && r.voice).toBe('shop');
  });

  it('không có giọng → giọng mẫu, kết quả ghi voice=demo', async () => {
    const { r, seen } = await run({});
    expect(seen[0]).toMatchObject({
      shopPronoun: 'shop',
      customerAddress: 'ban',
      do: [],
      dont: [],
    });
    expect(r.ok && r.voice).toBe('demo');
  });
});

describe('Q-POR12 Thử AI — ô "lượt trước" (tùy chọn)', () => {
  it('lượt trước đi tới bước extract dưới dạng lịch sử ĐÃ che PII; không có ô → không có lịch sử', async () => {
    const seen: unknown[] = [];
    const base = createDemoExtractor();
    const extractor: Extractor = {
      async extract(input) {
        seen.push(input.history);
        return base.extract(input);
      },
    };
    const run = createTryAiAction({
      quota: createTryQuota({ limit: 5 }),
      now,
      knowledgeRunner: demoKnowledgeRunner,
      buildDeps: () => ({
        extractor,
        drafter: createDemoDrafter(),
        knowledge: createDemoKnowledge(),
      }),
    });
    await run(
      session,
      'M đen',
      'Khách: áo thun basic giá bn? gọi 0912345678\nShop: Dạ bạn chọn size và màu nào ạ?',
    );
    await run(session, 'ship về Hà Nội bao nhiêu');
    const withHistory = JSON.stringify(seen[0]);
    expect(withHistory).toContain('áo thun basic giá bn?');
    expect(withHistory).toContain('Dạ bạn chọn size và màu nào ạ?');
    expect(withHistory).not.toContain('0912345678');
    expect(seen[1]).toBeUndefined();
  });
});
