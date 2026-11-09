import { maskPii, unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import { buildDraftMessages, type DraftInput } from './draft-prompt';
import { createLlmDrafter, DRAFT_PROMPT_VERSION } from './drafter';

/** DRAFT-FACT-SLOTS: chế độ chỗ giữ chỗ ở prompt và bộ soạn (ADR 017). */
const WS = '11111111-1111-4111-8111-111111111111';
const input = (over: Partial<DraftInput> = {}): DraftInput => ({
  workspaceId: WS,
  question: maskPii('Tote bag giá bao nhiêu, ship Hà Nội mất mấy ngày?'),
  lang: 'vi',
  kbVersion: 'kb-1',
  voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
  sources: [
    { id: 'p1', kind: 'product', text: unsafeMarkMasked('Túi tote: giá 99.000đ'), relevance: 0.9 },
  ],
  factSlots: {
    facts: [
      { id: 'product_name.1', kind: 'product_name' },
      { id: 'price.1', kind: 'price' },
      { id: 'ship_time', kind: 'ship_time' },
    ],
  },
  ...over,
});

const userText = (i: DraftInput) =>
  buildDraftMessages(i)
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

describe('prompt chế độ chỗ giữ chỗ', () => {
  it('liệt kê từng mã sự kiện kèm nhãn và luật cấm số/khẳng định ngoài chỗ giữ chỗ', () => {
    const text = userText(input());
    expect(text).toContain('<facts>');
    expect(text).toContain('{fact:price.1}');
    expect(text).toContain('giá');
    expect(text).toContain('{fact:ship_time}');
    expect(text).toMatch(/KHÔNG viết chữ số/);
    expect(text).toMatch(/CÙNG tập chỗ giữ chỗ/);
  });

  it('không chứa GIÁ TRỊ của sự kiện (code điền sau) — chỉ mã', () => {
    const text = userText(input());
    const facts = text.slice(text.indexOf('<facts>'), text.indexOf('</facts>'));
    expect(facts).not.toContain('99.000');
  });

  it('không có factSlots → prompt cũ, không có khối <facts>', () => {
    const { factSlots: _omit, ...rest } = input();
    expect(userText(rest)).not.toContain('<facts>');
  });
});

function fakeLlm(text: string) {
  const calls: LlmCallInput[] = [];
  const llm = {
    async call(callInput: LlmCallInput): Promise<LlmCallResult> {
      calls.push(callInput);
      return {
        text,
        model: callInput.model,
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
        cacheHit: false,
        usageId: 'u1',
      };
    },
  } as LlmClient;
  return { llm, calls };
}

describe('bộ soạn chế độ chỗ giữ chỗ', () => {
  const slotReply = JSON.stringify({
    reply: '{fact:product_name.1} giá {fact:price.1}, giao trong {fact:ship_time} bạn nhé!',
    lang: 'vi',
    sources: [],
    claims: [],
    unanswered_topics: [],
    needs_human: false,
    reason: '',
    variants: ['Giá {fact:product_name.1} là {fact:price.1}, ship {fact:ship_time} bạn nhé.'],
  });

  it('nguồn rỗng KHÔNG chặn (sự kiện đến từ fact plan); prompt_version đánh dấu chế độ; đúng 1 lần gọi', async () => {
    const { llm, calls } = fakeLlm(slotReply);
    const result = await createLlmDrafter({ llm, model: 'm' }).draft(input({ sources: [] }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.promptVersion).toBe(`${DRAFT_PROMPT_VERSION}+slots@2`);
    expect(result.needs_human).toBe(false);
    expect(result.reply).toContain('{fact:price.1}');
    expect(result.variants.length).toBeGreaterThanOrEqual(1);
  });

  it('không có factSlots: hành vi cũ (nguồn rỗng → needs_human, không gọi LLM)', async () => {
    const { llm, calls } = fakeLlm(slotReply);
    const { factSlots: _omit, ...rest } = input({ sources: [] });
    const result = await createLlmDrafter({ llm, model: 'm' }).draft(rest);
    expect(calls).toHaveLength(0);
    expect(result.needs_human).toBe(true);
  });
});

describe('prompt chế độ chỗ giữ chỗ — mã BẮT BUỘC, cấm tình trạng hàng/câu mời/hỏi thêm', () => {
  it('liệt kê "BẮT BUỘC dùng đủ" đúng các mã code tính; cấm còn/hết hàng, câu mời; cấm hỏi thêm khi không có "Cần hỏi khách"', () => {
    const text = userText(
      input({
        factSlots: {
          facts: [
            { id: 'product_name.1', kind: 'product_name' },
            { id: 'price.1', kind: 'price' },
            { id: 'ship_destination', kind: 'ship_destination' },
          ],
          required: ['price.1', 'ship_destination'],
        },
      }),
    );
    expect(text).toContain('BẮT BUỘC dùng đủ: {fact:price.1} {fact:ship_destination}');
    expect(text).toContain('{fact:ship_destination} — câu nói về khu vực giao hàng');
    expect(text).toMatch(/CẤM tự viết tình trạng hàng/);
    expect(text).toMatch(/CẤM tự viết câu mời/);
    expect(text).toMatch(/KHÔNG hỏi thêm khách/);
  });
  it('có "Cần hỏi khách" thì không có câu cấm hỏi thêm', () => {
    const text = userText(
      input({
        decision: {
          action: 'clarify',
          clarify: { ask: 'variant', axes: ['size'], options: [] },
          unansweredTopics: [],
          redirectTemplates: [],
        },
      }),
    );
    expect(text).not.toMatch(/KHÔNG hỏi thêm khách/);
  });
  it('nhãn chủ đề chưa có nguồn theo ngôn ngữ, không nối mã enum thô', () => {
    const text = userText(
      input({
        factSlots: undefined,
        decision: {
          action: 'redirect',
          clarify: null,
          unansweredTopics: ['shipping', 'policy'],
          redirectTemplates: [],
        },
      }),
    );
    expect(text).toContain('Chủ đề chưa có nguồn (mời ib, không đoán): vận chuyển, chính sách');
    expect(text).not.toContain('shipping, policy');
  });
});
