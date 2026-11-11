import { describe, expect, it, vi } from 'vitest';
import { createGapRetry } from './gap-retry';

const CTX = { workspaceId: 'w1', userId: 'u1' };
const gap = { id: 'g1', sampleQuestionMasked: 'ship Cà Mau bao nhiêu' };
const done = {
  ok: true,
  result: {
    status: 'done',
    reply: 'Dạ phí ship 30.000đ ạ.',
    decision: { action: 'answer', needsHuman: false },
  },
};

const setup = (over: Record<string, unknown> = {}) => {
  let clock = 0;
  const tryAi = vi.fn(async () => done);
  const retry = createGapRetry({
    findGap: async (_c, id) => (id === 'g1' ? gap : null),
    tryAi: tryAi as never,
    now: () => clock,
    ...over,
  });
  return { retry, tryAi, tick: (ms: number) => (clock += ms) };
};

describe('Thử lại câu này', () => {
  it('chạy đúng câu mẫu của gap qua Thử AI (LLM giả qua DI) và trả câu trả lời + hành động', async () => {
    const { retry, tryAi } = setup();
    expect(await retry(CTX, 'g1')).toEqual({
      ok: true,
      action: 'answer',
      reply: 'Dạ phí ship 30.000đ ạ.',
      needsHuman: false,
    });
    expect(tryAi).toHaveBeenCalledWith(CTX, 'ship Cà Mau bao nhiêu');
  });

  it('gap lạ/workspace khác → not_found và KHÔNG gọi AI', async () => {
    const { retry, tryAi } = setup();
    expect(await retry(CTX, 'zzz')).toEqual({ ok: false, reason: 'not_found' });
    expect(tryAi).not.toHaveBeenCalled();
  });

  it('1 lần/dòng/phút: lần hai bị chặn không gọi AI, qua phút chạy lại được', async () => {
    const { retry, tryAi, tick } = setup();
    await retry(CTX, 'g1');
    tick(10_000);
    expect(await retry(CTX, 'g1')).toEqual({ ok: false, reason: 'throttled', retryAfterSec: 50 });
    expect(tryAi).toHaveBeenCalledTimes(1);
    tick(50_000);
    expect((await retry(CTX, 'g1')).ok).toBe(true);
  });

  it('lỗi từ Thử AI (thiếu LLM, hết lượt…) được chuyển nguyên lý do', async () => {
    const { retry } = setup({
      tryAi: async () => ({ ok: false, reason: 'llm_flag_off' }),
    });
    expect(await retry(CTX, 'g1')).toEqual({ ok: false, reason: 'llm_flag_off' });
  });
});
