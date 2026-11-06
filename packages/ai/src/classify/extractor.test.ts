import { isAppError, maskPii } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import { createLlmExtractor, EXTRACT_PROMPT_VERSION, EXTRACT_STEP } from './extractor';

const WS = '11111111-1111-4111-8111-111111111111';
const good = JSON.stringify({
  labels: [
    { label: 'price', confidence: 0.9 },
    { label: 'complaint', confidence: 0.4 },
  ],
  product_mentions: ['áo thun'],
  refers_to_image: true,
  size: 'M',
  color: null,
  height_cm: null,
  weight_kg: null,
  qty: 1,
  cited_price_vnd: null,
  order_intent: { items: ['áo thun'], phone: '0901234567', address: null },
  asks: ['giá'],
});

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

describe('FR-027/FR-162 extractor LLM', () => {
  it('gọi đúng một lần với step, prompt_version, model, văn bản đã che', async () => {
    const { llm, calls } = fakeLlm(good);
    const r = await createLlmExtractor({ llm, model: 'nho' }).extract({
      workspaceId: WS,
      text: maskPii('Áo này giá sao, SĐT 0901234567'),
      hasMedia: true,
    });
    expect(calls).toHaveLength(1);
    const call = calls[0] as LlmCallInput;
    expect(call).toMatchObject({
      workspaceId: WS,
      step: EXTRACT_STEP,
      promptVersion: EXTRACT_PROMPT_VERSION,
      model: 'nho',
      temperature: 0,
    });
    const all = call.messages.map((m) => m.content).join('\n');
    expect(all).not.toContain('0901234567');
    expect(all).toContain('[sđt]');
    expect(call.messages[0]?.role).toBe('system');
    expect(call.messages[1]?.content).toContain('ảnh/video');
    expect(r.labels.map((l) => l.label)).toEqual(['price', 'complaint']);
    expect(r.order_intent?.phone).toBeNull();
  });

  it('không có media → không nhắc ảnh/video trong tin nhắn khách', async () => {
    const { llm, calls } = fakeLlm(good);
    await createLlmExtractor({ llm, model: 'm' }).extract({ workspaceId: WS, text: maskPii('hi') });
    expect(calls[0]?.messages[1]?.content).not.toContain('ảnh/video');
  });

  it('cắt văn bản quá dài', async () => {
    const { llm, calls } = fakeLlm(good);
    await createLlmExtractor({ llm, model: 'm' }).extract({
      workspaceId: WS,
      text: maskPii('a'.repeat(5000)),
    });
    expect((calls[0]?.messages[1]?.content ?? '').length).toBeLessThan(2200);
  });

  it('đầu ra hỏng → LLM_UNAVAILABLE, không gọi lại', async () => {
    const { llm, calls } = fakeLlm('không phải json');
    await expect(
      createLlmExtractor({ llm, model: 'm' }).extract({ workspaceId: WS, text: maskPii('x') }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'LLM_UNAVAILABLE');
    expect(calls).toHaveLength(1);
  });

  it('lỗi từ llm.call được ném nguyên (không nuốt)', async () => {
    const { llm } = fakeLlm(new Error('mạng'));
    await expect(
      createLlmExtractor({ llm, model: 'm' }).extract({ workspaceId: WS, text: maskPii('x') }),
    ).rejects.toThrow('mạng');
  });
});
