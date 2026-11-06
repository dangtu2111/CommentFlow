import { unsafeMarkMasked as m, maskPii } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import { createFixtureRewriter } from './fixture-rewriter';
import { loadRewriteConfig } from './rewrite-config';
import { createLlmRewriter, REWRITE_PROMPT_VERSION, REWRITE_STEP } from './rewriter';

const WS = '11111111-1111-4111-8111-111111111111';

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

const ambiguous = {
  workspaceId: WS,
  comment: m('còn không shop'),
  parentComment: m('áo này giá sao'),
  productKnown: false,
};

describe('FR-137 rewriter LLM', () => {
  it('đã có sản phẩm → KHÔNG gọi LLM, dùng câu quy tắc', async () => {
    const { llm, calls } = fakeLlm('x');
    const r = await createLlmRewriter({ llm, model: 'nho' }).rewrite({
      ...ambiguous,
      productKnown: true,
    });
    expect(calls).toHaveLength(0);
    expect(r).toEqual({
      original: 'còn không shop',
      searchQuery: 'còn không shop | áo này giá sao',
      source: 'rule',
    });
  });

  it('đủ điều kiện → đúng một llm.call (step, prompt_version, model, nội dung đã che)', async () => {
    const { llm, calls } = fakeLlm('áo thun còn hàng không');
    const r = await createLlmRewriter({ llm, model: 'nho' }).rewrite({
      ...ambiguous,
      postCaption: m('Áo thun mới'),
      context: {
        turns: [{ from: 'shop', text: m('Dạ áo 199k ạ'), at: new Date() }],
        otherQuestions: [{ postId: 'p9', text: m('có quần không'), at: new Date() }],
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      workspaceId: WS,
      step: REWRITE_STEP,
      model: 'nho',
      promptVersion: REWRITE_PROMPT_VERSION,
    });
    const body = calls[0]?.messages.map((x) => x.content).join('\n') ?? '';
    expect(body).toContain('còn không shop');
    expect(body).toContain('Dạ áo 199k ạ');
    expect(body).toContain('có quần không');
    expect(r).toEqual({
      original: 'còn không shop',
      searchQuery: 'áo thun còn hàng không',
      source: 'llm',
    });
  });

  it('đầu ra LLM được che PII, lấy dòng đầu, bỏ dấu nháy, cắt 200 ký tự', async () => {
    const { llm } = fakeLlm(`"Áo thun, gọi 0901234567 hoặc a@b.com ${'x'.repeat(300)}"\ndòng thừa`);
    const r = await createLlmRewriter({ llm, model: 'nho' }).rewrite(ambiguous);
    expect(r.source).toBe('llm');
    expect(r.searchQuery).not.toContain('0901234567');
    expect(r.searchQuery).not.toContain('a@b.com');
    expect(r.searchQuery).not.toContain('dòng thừa');
    expect(r.searchQuery.length).toBeLessThanOrEqual(200);
    expect(r.searchQuery).toBe(maskPii(r.searchQuery));
  });

  it('đầu ra rỗng → quay về câu quy tắc', async () => {
    const { llm, calls } = fakeLlm('  \n ');
    const r = await createLlmRewriter({ llm, model: 'nho' }).rewrite(ambiguous);
    expect(calls).toHaveLength(1);
    expect(r.source).toBe('rule');
    expect(r.searchQuery).toBe('còn không shop | áo này giá sao');
  });

  it('lỗi llm.call được ném nguyên (không nuốt)', async () => {
    const err = new Error('mạng');
    const { llm } = fakeLlm(err);
    await expect(createLlmRewriter({ llm, model: 'nho' }).rewrite(ambiguous)).rejects.toBe(err);
  });

  it('câu gốc không bị đổi dù đã viết lại', async () => {
    const { llm } = fakeLlm('khác hẳn');
    const r = await createLlmRewriter({ llm, model: 'nho' }).rewrite(ambiguous);
    expect(r.original).toBe('còn không shop');
  });
});

describe('FR-137 fixture rewriter', () => {
  it('khớp fixture đầu tiên; không khớp → câu quy tắc, không gọi mạng', async () => {
    const rw = createFixtureRewriter([{ match: /còn không/, searchQuery: m('áo thun còn hàng') }]);
    expect(await rw.rewrite(ambiguous)).toEqual({
      original: 'còn không shop',
      searchQuery: 'áo thun còn hàng',
      source: 'llm',
    });
    expect(await rw.rewrite({ ...ambiguous, comment: m('giá?') })).toEqual({
      original: 'giá?',
      searchQuery: 'giá? | áo này giá sao',
      source: 'rule',
    });
    expect(await createFixtureRewriter().rewrite(ambiguous)).toMatchObject({ source: 'rule' });
  });
});

describe('FR-137 loadRewriteConfig', () => {
  it('mặc định TẮT, model mock-llm; chỉ đúng chữ true mới bật', () => {
    expect(loadRewriteConfig({})).toEqual({ enabled: false, model: 'mock-llm' });
    expect(loadRewriteConfig({ REWRITE_LLM_ENABLED: 'TRUE' }).enabled).toBe(false);
    expect(loadRewriteConfig({ REWRITE_LLM_ENABLED: 'true', REWRITE_LLM_MODEL: ' rẻ ' })).toEqual({
      enabled: true,
      model: 'rẻ',
    });
  });
});
