import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../llm-client';
import {
  createLlmDistiller,
  DISTILL_PROMPT_VERSION,
  DISTILL_STEP,
  type Distiller,
} from './distiller';
import { type DistillChunk, type DistillOps, runKbDistill } from './run-distill';
import { parseDistillItems } from './schema';
import { digitGroups, verifyDistillItem } from './verify';

/** M3-2a: kiểm cứng, trần chi phí, chạy một lần mỗi bản nội dung. LLM giả cắm qua tham số (test tự động). */
const SOURCE =
  'Áo thun làm từ cotton 100%, xuất xứ Việt Nam.\nGiặt máy ở nhiệt độ dưới 30 độ. Phí ship 30.000đ toàn quốc.';

const item = (over: Partial<Parameters<typeof verifyDistillItem>[0]> = {}) => ({
  kind: 'product_attr' as const,
  question: 'Áo làm từ chất liệu gì?',
  answer: 'Áo làm từ cotton 100%.',
  evidenceQuote: 'Áo thun làm từ cotton 100%, xuất xứ Việt Nam.',
  ...over,
});

describe('verifyDistillItem — kiểm cứng bằng code', () => {
  it('đạt: trích nguyên văn, mọi chữ số có trong trích dẫn', () => {
    expect(verifyDistillItem(item(), SOURCE)).toBeNull();
  });

  it('chỉ khác khoảng trắng/xuống dòng vẫn tính nguyên văn', () => {
    const quote = 'Giặt máy ở nhiệt độ   dưới 30 độ.';
    expect(
      verifyDistillItem(
        item({ question: 'Giặt thế nào?', answer: 'Giặt máy dưới 30 độ.', evidenceQuote: quote }),
        SOURCE,
      ),
    ).toBeNull();
  });

  it('trích dẫn không có trong nguồn (bịa/diễn đạt lại) → quote_not_in_source', () => {
    expect(
      verifyDistillItem(item({ evidenceQuote: 'Áo làm bằng cotton nguyên chất 100%' }), SOURCE),
    ).toBe('quote_not_in_source');
  });

  it('chữ số trong câu đáp không có trong trích dẫn → digit_not_in_quote', () => {
    expect(verifyDistillItem(item({ answer: 'Áo cotton 100%, bảo hành 12 tháng.' }), SOURCE)).toBe(
      'digit_not_in_quote',
    );
  });

  it('số tiền (kể cả có trong nguồn) bị loại: giá chỉ lấy từ products', () => {
    expect(
      verifyDistillItem(
        item({
          question: 'Phí ship bao nhiêu?',
          answer: 'Phí ship 30.000đ toàn quốc.',
          evidenceQuote: 'Phí ship 30.000đ toàn quốc.',
        }),
        SOURCE,
      ),
    ).toBe('money_in_answer');
  });

  it('chỗ giữ chỗ {fact:…}/{src:…} do model viết bị loại', () => {
    expect(verifyDistillItem(item({ answer: 'Áo {fact:price} cotton 100%' }), SOURCE)).toBe(
      'placeholder_in_text',
    );
  });

  it('digitGroups gộp dấu ngăn nghìn', () => {
    expect(digitGroups('30.000đ và 1,500 và 7 ngày')).toEqual(['30000', '1500', '7']);
  });
});

describe('parseDistillItems', () => {
  it('JSON hỏng/không có items → null; mục sai cấu trúc được đếm riêng', () => {
    expect(parseDistillItems('không phải json')).toBeNull();
    expect(parseDistillItems('{"x":1}')).toBeNull();
    const parsed = parseDistillItems(
      JSON.stringify({ items: [item(), { kind: 'faq', question: 'a' }] }),
    );
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.malformed).toBe(1);
  });
});

const fakeOps = (chunks: DistillChunk[]) => {
  const state = { drafts: [] as unknown[], marked: [] as string[], listed: 0 };
  const ops: DistillOps = {
    listChunks: async (limit) => {
      state.listed = limit;
      return chunks.filter((c) => !state.marked.includes(c.id));
    },
    insertDrafts: async (items) => {
      state.drafts.push(...items);
      return items.length;
    },
    markDistilled: async (done) => {
      state.marked.push(...done.map((d) => d.id));
    },
  };
  return { ops, state };
};
const chunk = (id: string, content = SOURCE): DistillChunk => ({
  id,
  content,
  contentHash: `h-${id}`,
});

describe('runKbDistill', () => {
  it('chỉ mục đạt kiểm cứng vào nháp; đếm số bị loại theo lý do; đoạn xong được đánh dấu', async () => {
    const distiller: Distiller = {
      distill: async () => ({
        items: [item(), item({ evidenceQuote: 'câu không có trong nguồn đâu nhé' })],
        malformed: 0,
        costUsd: 0.01,
      }),
    };
    const { ops, state } = fakeOps([chunk('c1')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(stats).toMatchObject({ considered: 1, called: 1, accepted: 1, inserted: 1 });
    expect(stats.rejected).toEqual({ quote_not_in_source: 1 });
    expect(state.drafts).toMatchObject([{ kind: 'product_attr', sourceChunkId: 'c1', lang: 'vi' }]);
    expect(state.marked).toEqual(['c1']);
  });

  it('chạy lại khi đã đánh dấu → không gọi LLM nữa (một lần mỗi bản nội dung)', async () => {
    let calls = 0;
    const distiller: Distiller = {
      distill: async () => {
        calls += 1;
        return { items: [], malformed: 0, costUsd: 0.001 };
      },
    };
    const { ops } = fakeOps([chunk('c1'), chunk('c2')]);
    await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(calls).toBe(2);
    await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(calls).toBe(2);
  });

  it('vượt trần chi phí → dừng, đoạn còn lại chưa đánh dấu để lần sau', async () => {
    const distiller: Distiller = {
      distill: async () => ({ items: [], malformed: 0, costUsd: 0.12 }),
    };
    const { ops, state } = fakeOps([chunk('c1'), chunk('c2'), chunk('c3')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops, costCapUsd: 0.2 });
    expect(stats.stoppedByCap).toBe(true);
    expect(stats.called).toBe(2);
    expect(state.marked).toEqual(['c1', 'c2']);
  });

  it('đầu ra không đọc được → đếm invalidOutput, đoạn KHÔNG đánh dấu (thử lại lần sau); PII bị che trước khi gửi', async () => {
    const seen: string[] = [];
    const distiller: Distiller = {
      distill: async ({ text }) => {
        seen.push(text);
        return { items: null, malformed: 0, costUsd: 0 };
      },
    };
    const { ops, state } = fakeOps([chunk('c1', 'Liên hệ 0912345678 hoặc a@b.vn')]);
    const stats = await runKbDistill({ workspaceId: 'w', distiller, ops });
    expect(stats.invalidOutput).toBe(1);
    expect(state.marked).toEqual([]);
    expect(seen[0]).not.toMatch(/0912345678|a@b\.vn/);
  });

  it('lỗi gọi LLM được ném nguyên, không ghi gì', async () => {
    const distiller: Distiller = {
      distill: async () => {
        throw new Error('LLM_UNAVAILABLE');
      },
    };
    const { ops, state } = fakeOps([chunk('c1')]);
    await expect(runKbDistill({ workspaceId: 'w', distiller, ops })).rejects.toThrow(
      'LLM_UNAVAILABLE',
    );
    expect(state.drafts).toEqual([]);
    expect(state.marked).toEqual([]);
  });
});

describe('createLlmDistiller — gọi LLM qua LlmClient', () => {
  const fakeLlm = (text: string, costUsd = 0.001) => {
    const calls: LlmCallInput[] = [];
    const llm = {
      call: async (input: LlmCallInput) => {
        calls.push(input);
        return { text, costUsd } as LlmCallResult;
      },
    } as LlmClient;
    return { llm, calls };
  };
  const text = unsafeMarkMasked(SOURCE);

  it('một lần gọi, đúng bước/prompt_version, nhiệt độ 0; trả mục đã phân tích và chi phí', async () => {
    const out = JSON.stringify({ items: [item()] });
    const { llm, calls } = fakeLlm(out);
    const result = await createLlmDistiller({ llm, model: 'm', seed: 7 }).distill({
      workspaceId: 'ws1',
      text,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      step: DISTILL_STEP,
      promptVersion: DISTILL_PROMPT_VERSION,
      temperature: 0,
      seed: 7,
      model: 'm',
    });
    expect(result.items).toHaveLength(1);
    expect(result.costUsd).toBe(0.001);
  });

  it('không truyền seed khi không đặt; đầu ra không đọc được → items null', async () => {
    const { llm, calls } = fakeLlm('không phải JSON');
    const result = await createLlmDistiller({ llm, model: 'm' }).distill({
      workspaceId: 'ws1',
      text,
    });
    expect(calls[0]).not.toHaveProperty('seed');
    expect(result.items).toBeNull();
    expect(result.malformed).toBe(0);
  });
});
