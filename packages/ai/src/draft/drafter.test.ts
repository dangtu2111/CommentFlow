import { isAppError, maskPii, unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import type { DraftInput } from './draft-prompt';
import { createLlmDrafter, DRAFT_PROMPT_VERSION, DRAFT_STEP } from './drafter';

const WS = '11111111-1111-4111-8111-111111111111';
const good = {
  reply: 'Dạ áo này giá 199.000đ ạ.',
  lang: 'vi',
  sources: ['sp-1'],
  claims: [{ text: 'Giá 199.000đ', source_ids: ['sp-1'], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
};

function fakeLlm(text: string | Error) {
  const calls: LlmCallInput[] = [];
  const llm = {
    async call(input: LlmCallInput): Promise<LlmCallResult> {
      calls.push(input);
      if (text instanceof Error) throw text;
      return {
        text,
        model: input.model,
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0,
        costUsd: 0,
        cacheHit: false,
        usageId: 'u1',
      };
    },
  } as LlmClient;
  return { llm, calls };
}

const input = (over: Partial<DraftInput> = {}): DraftInput => ({
  workspaceId: WS,
  question: maskPii('Áo này giá sao?'),
  lang: 'vi',
  kbVersion: 'kb-1',
  voice: { do: [], dont: [], shopPronoun: 'em', customerAddress: 'anh_chi' },
  sources: [
    { id: 'sp-1', kind: 'product', text: unsafeMarkMasked('Áo 199000đ'), relevance: 0.8 },
    { id: 'kb-9', kind: 'kb', text: unsafeMarkMasked('Không liên quan'), relevance: 0.1 },
  ],
  ...over,
});

describe('FR-029/FR-138 drafter LLM', () => {
  it('gọi đúng một lần: step, prompt_version, model, nhiệt độ thấp, cache hai khối đầu', async () => {
    const { llm, calls } = fakeLlm(JSON.stringify(good));
    const r = await createLlmDrafter({ llm, model: 'soan' }).draft(
      input({ draftId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      workspaceId: WS,
      step: DRAFT_STEP,
      promptVersion: DRAFT_PROMPT_VERSION,
      model: 'soan',
      temperature: 0.2,
      draftId: '22222222-2222-4222-8222-222222222222',
    });
    expect(calls[0]?.messages.map((m) => m.cache)).toEqual([true, true, undefined]);
    expect(r.needs_human).toBe(false);
    expect(r.sources).toEqual(['sp-1']);
  });

  it('chỉ nguồn đạt ngưỡng mới vào prompt', async () => {
    const { llm, calls } = fakeLlm(JSON.stringify(good));
    await createLlmDrafter({ llm, model: 'm' }).draft(input());
    const user = calls[0]?.messages[2]?.content ?? '';
    expect(user).toContain('sp-1');
    expect(user).not.toContain('kb-9');
  });

  it('ngưỡng đúng bằng minRelevance thì được vào; tham số ghi đè mặc định', async () => {
    const { llm, calls } = fakeLlm(JSON.stringify({ ...good, sources: ['kb-9'], claims: [] }));
    await createLlmDrafter({ llm, model: 'm' }).draft(input({ minRelevance: 0.1 }));
    expect(calls[0]?.messages[2]?.content).toContain('kb-9');
  });

  it('không có nguồn đạt ngưỡng → không gọi LLM, needs_human', async () => {
    const { llm, calls } = fakeLlm(JSON.stringify(good));
    const drafter = createLlmDrafter({ llm, model: 'm' });
    const none = await drafter.draft(input({ sources: [], lang: 'en' }));
    expect(none).toMatchObject({ needs_human: true, lang: 'en', reply: '' });
    const low = await drafter.draft(
      input({ sources: [{ id: 'a', kind: 'kb', text: unsafeMarkMasked('x'), relevance: 0.34 }] }),
    );
    expect(low.needs_human).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('ý fact trỏ nguồn không có trong prompt → Thiếu nguồn', async () => {
    const bad = { ...good, claims: [{ text: 'x', source_ids: ['kb-9'], kind: 'fact' }] };
    const { llm } = fakeLlm(JSON.stringify(bad));
    const r = await createLlmDrafter({ llm, model: 'm' }).draft(input());
    expect(r).toMatchObject({ needs_human: true, reason: 'Thiếu nguồn', reply: '' });
  });

  it('đầu ra hỏng → LLM_UNAVAILABLE, không gọi lại', async () => {
    const { llm, calls } = fakeLlm('hỏng');
    await expect(createLlmDrafter({ llm, model: 'm' }).draft(input())).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'LLM_UNAVAILABLE',
    );
    expect(calls).toHaveLength(1);
  });

  it('lỗi llm.call được ném nguyên', async () => {
    const { llm } = fakeLlm(new Error('mạng'));
    await expect(createLlmDrafter({ llm, model: 'm' }).draft(input())).rejects.toThrow('mạng');
  });
});
