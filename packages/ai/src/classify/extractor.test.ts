import { isAppError, maskPii } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import {
  createLlmExtractor,
  EXTRACT_PROMPT_VERSION,
  EXTRACT_STEP,
  type Extractor,
  withSelfConsistency,
} from './extractor';

const WS = '11111111-1111-4111-8111-111111111111';
const good = JSON.stringify({
  labels: [{ label: 'price' }, { label: 'complaint' }],
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

function fakeLlm(text: string | Error, logprobs?: LlmCallResult['logprobs']) {
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
        reasoningTokens: 0,
        costUsd: 0,
        cacheHit: false,
        usageId: 'u1',
        ...(logprobs ? { logprobs } : {}),
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

  it('nhiệt độ 0; có seed cấu hình thì truyền xuống, không có thì không', async () => {
    const a = fakeLlm(good);
    await createLlmExtractor({ llm: a.llm, model: 'm', seed: 42 }).extract({
      workspaceId: WS,
      text: maskPii('hi'),
    });
    expect(a.calls[0]).toMatchObject({ temperature: 0, seed: 42 });
    const b = fakeLlm(good);
    await createLlmExtractor({ llm: b.llm, model: 'm' }).extract({
      workspaceId: WS,
      text: maskPii('hi'),
    });
    expect(b.calls[0]?.temperature).toBe(0);
    expect(b.calls[0] && 'seed' in b.calls[0]).toBe(false);
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

describe('09 §6.0 p_label từ logprob / tự nhất quán (không dùng số model tự ghi)', () => {
  it('có logprob → labelSignal.logprob = xác suất của giá trị nhãn chính, và xin logprobs', async () => {
    const { llm, calls } = fakeLlm(good, [
      { token: '{"labels":[{"label":"', logprob: -0.01 },
      { token: 'price', logprob: Math.log(0.7) },
      { token: '"}]}', logprob: -0.1 },
    ]);
    const r = await createLlmExtractor({ llm, model: 'nho' }).extract({
      workspaceId: WS,
      text: maskPii('giá bao nhiêu'),
    });
    expect(calls[0]?.logprobs).toBe(true);
    expect(r.labelSignal?.logprob).toBeCloseTo(0.7, 5);
  });

  it('không có logprob → không có tín hiệu (không đoán)', async () => {
    const { llm } = fakeLlm(good);
    const r = await createLlmExtractor({ llm, model: 'nho' }).extract({
      workspaceId: WS,
      text: maskPii('giá bao nhiêu'),
    });
    expect(r.labelSignal).toBeUndefined();
  });

  const input = { workspaceId: WS, text: maskPii('ship bao lâu') };
  const outcome = (label: 'price' | 'advice', signal?: object) =>
    ({
      ...JSON.parse(good),
      labels: [{ label }],
      ...(signal ? { labelSignal: signal } : {}),
    }) as Awaited<ReturnType<Extractor['extract']>>;

  it('withSelfConsistency: đã có logprob/ml → KHÔNG gọi thêm', async () => {
    let calls = 0;
    const base: Extractor = {
      async extract() {
        calls += 1;
        return outcome('price', { logprob: 0.8 });
      },
    };
    const r = await withSelfConsistency(base).extract(input);
    expect(calls).toBe(1);
    expect(r.labelSignal).toEqual({ logprob: 0.8 });
  });

  it('withSelfConsistency: thiếu tín hiệu → chạy thêm, consistency = tỉ lệ trùng nhãn chính', async () => {
    const sequence = ['advice', 'price'] as const;
    let i = 0;
    const base: Extractor = {
      async extract() {
        return outcome(sequence[i++ % 2] as 'price' | 'advice');
      },
    };
    const r = await withSelfConsistency(base).extract(input);
    expect(r.labelSignal?.consistency).toBe(0.5);
    expect(r.labels[0]?.label).toBe('advice');
  });

  it('withSelfConsistency: lần chạy phụ hỏng không làm hỏng kết quả (lần đó bị bỏ)', async () => {
    let i = 0;
    const base: Extractor = {
      async extract() {
        if (i++ > 0) throw new Error('boom');
        return outcome('advice');
      },
    };
    const r = await withSelfConsistency(base).extract(input);
    expect(r.labelSignal?.consistency).toBe(1);
  });

  it('withSelfConsistency: lần chạy ĐẦU hỏng → ném lỗi (không nuốt)', async () => {
    const base: Extractor = {
      async extract() {
        throw new Error('boom');
      },
    };
    await expect(withSelfConsistency(base).extract(input)).rejects.toThrow('boom');
  });
});
