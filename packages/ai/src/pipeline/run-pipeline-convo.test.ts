import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import type { ExtractOutcome, Extractor } from '../classify/extractor';
import { FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftInput } from '../draft/draft-prompt';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import {
  type PipelineConvoInput,
  type PipelineDeps,
  type PipelineInput,
  type PipelineResult,
  runPipeline,
  type TryCandidate,
  type TryKnowledge,
} from './run-pipeline';

/**
 * PIPE-CONVO-CONTEXT (Q-POR12) + FR-167 (Q-POR14) ở lõi dùng chung. Đường vàng 2 lượt: "áo thun basic giá bn?" → hỏi lại size/màu →
 * khách trả lời "M đen" → AI nhận đúng sản phẩm từ lượt trước và trả lời 150.000đ (KHÔNG hỏi lại lần hai).
 */
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const base: PipelineInput = {
  workspaceId: 'ws1',
  text: 'áo thun basic giá bn?',
  kbVersion: 'v1',
  voice,
  autoSendEnabled: false,
};
const extract = (patch: Partial<ExtractResult>): ExtractOutcome => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  ...patch,
});

const productCandidate: TryCandidate = {
  id: PRODUCT,
  kind: 'product',
  title: 'Áo thun basic',
  text: unsafeMarkMasked('Áo thun basic: giá 150.000đ; biến thể: size M màu đen giá 150.000đ'),
  score: 1,
  topics: ['product_info', 'size'],
  priceSources: [
    { productId: PRODUCT, variantId: null, priceVnd: 150000, stock: 5, updatedFromSourceAt: null },
  ],
};

function knowledge(spy: { resolve?: (ids: readonly string[]) => void } = {}): TryKnowledge {
  const match = {
    ids: [PRODUCT],
    names: ['Áo thun basic'],
    missingAxes: ['size', 'color'] as const,
  };
  return {
    matchProducts: async (mentions) =>
      mentions.some((m) => m.toLowerCase().includes('áo thun'))
        ? { ...match, missingAxes: [...match.missingAxes] }
        : { ids: [], names: [], missingAxes: [] },
    resolveProducts: async (ids) => {
      spy.resolve?.(ids);
      return ids.includes(PRODUCT)
        ? { ...match, missingAxes: [...match.missingAxes] }
        : { ids: [], names: [], missingAxes: [] };
    },
    lookupProductFacts: async (ids) => (ids.includes(PRODUCT) ? [productCandidate] : []),
    searchKb: async () => [],
  };
}

const answerReply: DraftResult = {
  reply: 'Dạ áo thun basic size M màu đen giá 150.000đ ạ',
  lang: 'vi',
  sources: [PRODUCT],
  claims: [{ text: 'Giá 150.000đ', source_ids: [PRODUCT], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
};
const clarifyReply: DraftResult = {
  reply: 'Dạ bạn chọn size và màu nào ạ?',
  lang: 'vi',
  sources: [],
  claims: [],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
};

type Calls = { extractHistory: unknown[]; draftInputs: DraftInput[] };
function harness(turnExtracts: ExtractOutcome[]) {
  const calls: Calls = { extractHistory: [], draftInputs: [] };
  let i = 0;
  const extractor: Extractor = {
    async extract(input) {
      calls.extractHistory.push(input.history);
      const out = turnExtracts[Math.min(i, turnExtracts.length - 1)] as ExtractOutcome;
      i += 1;
      return out;
    },
  };
  const drafter: Drafter = {
    async draft(input) {
      calls.draftInputs.push(input);
      return input.decision?.action === 'clarify' ? clarifyReply : answerReply;
    },
  };
  const deps = (k: TryKnowledge = knowledge()): PipelineDeps => ({
    extractor,
    drafter,
    knowledge: k,
  });
  return { calls, deps };
}
const done = (r: PipelineResult) => {
  if (r.status !== 'done') throw new Error(`expected done, got ${r.status}`);
  return r;
};

const turn1 = extract({
  labels: [{ label: 'price' }],
  product_mentions: ['áo thun basic'],
  asks: ['giá'],
});
// Khách chỉ trả lời "M đen": không nêu tên sản phẩm, không nêu ý hỏi mới.
const turn2 = extract({ labels: [{ label: 'advice' }], size: 'M', color: 'đen', asks: [] });

describe('đường vàng 2 lượt: hỏi lại size/màu → "M đen" → trả lời 150.000đ', () => {
  it('lượt 1 hỏi lại (variant_missing) và ghi trạng thái: sản phẩm + ý đang chờ', async () => {
    const { deps } = harness([turn1]);
    const r1 = done(await runPipeline(base, deps()));
    expect(r1.decision).toMatchObject({ action: 'clarify', reason: 'variant_missing' });
    expect(r1.conversationState).toEqual({ productIds: [PRODUCT], pendingAsks: ['giá'] });
    expect(r1.resolvedProductIds).toEqual([PRODUCT]);
  });

  it('lượt 2 "M đen": nhận sản phẩm từ trạng thái, thừa hưởng ý "giá" → TRẢ LỜI 150.000đ, không hỏi lại lần hai', async () => {
    const h = harness([turn1, turn2]);
    const r1 = done(await runPipeline(base, h.deps()));
    const convo: PipelineConvoInput = {
      context: {
        turns: [
          {
            from: 'customer',
            text: unsafeMarkMasked('áo thun basic giá bn?'),
            at: new Date('2026-11-07T01:00:00Z'),
          },
          {
            from: 'shop',
            text: unsafeMarkMasked('Dạ bạn chọn size và màu nào ạ?'),
            at: new Date('2026-11-07T01:01:00Z'),
          },
        ],
        otherQuestions: [],
      },
      postProductIds: [],
      postProductNames: [],
      state: r1.conversationState,
    };
    const resolve = vi.fn();
    const r2 = done(
      await runPipeline(
        { ...base, text: 'M đen', convo, thread: { clarifyCount: 1, repeatCount: 0 } },
        h.deps(knowledge({ resolve })),
      ),
    );
    expect(resolve).toHaveBeenCalledWith([PRODUCT]);
    expect(r2.decision.action).toBe('answer');
    expect(r2.decision.reason).toBe('all_sourced');
    expect(r2.extract.asks).toEqual(['giá']);
    expect(r2.reply).toContain('150.000');
    expect(r2.conversationState.pendingAsks).toEqual([]);
    // Lịch sử đi tới extract và bước soạn (đã che PII, dạng dữ liệu).
    expect(JSON.stringify(h.calls.extractHistory[1])).toContain('Dạ bạn chọn size và màu nào ạ?');
    expect(h.calls.draftInputs[1]?.history?.turns).toHaveLength(2);
  });

  it('KHÔNG có trạng thái/lịch sử (lõi cũ) thì "M đen" vẫn không nhận ra sản phẩm → không trả lời được (chứng minh cần E2)', async () => {
    const h = harness([turn2]);
    const r = done(await runPipeline({ ...base, text: 'M đen' }, h.deps()));
    expect(r.decision.action).not.toBe('answer');
  });

  it('khách NÊU TÊN sản phẩm khác không khớp → KHÔNG dự phòng sang sản phẩm lượt trước/bài', async () => {
    const h = harness([extract({ product_mentions: ['quần jean xyz'], asks: ['giá'] })]);
    const resolve = vi.fn();
    const r = done(
      await runPipeline(
        {
          ...base,
          text: 'quần jean xyz giá bn',
          convo: {
            context: { turns: [], otherQuestions: [] },
            postProductIds: [PRODUCT],
            postProductNames: ['Áo thun basic'],
            state: null,
          },
        },
        h.deps(knowledge({ resolve })),
      ),
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(r.resolvedProductIds).toEqual([]);
  });
});

describe('sản phẩm gắn bài là ứng viên ưu tiên khi khách không nêu tên (docs/10 §5.1)', () => {
  it('"giá bn?" không nêu tên + bài gắn áo thun basic → nhận sản phẩm của bài', async () => {
    const h = harness([extract({ labels: [{ label: 'price' }], asks: ['giá'] })]);
    const resolve = vi.fn();
    const r = done(
      await runPipeline(
        {
          ...base,
          text: 'giá bn?',
          convo: {
            context: { turns: [], otherQuestions: [] },
            postProductIds: [PRODUCT],
            postProductNames: ['Áo thun basic'],
            state: null,
          },
        },
        h.deps(knowledge({ resolve })),
      ),
    );
    expect(resolve).toHaveBeenCalledWith([PRODUCT]);
    expect(r.resolvedProductIds).toEqual([PRODUCT]);
  });

  it('trạng thái lượt trước ưu tiên hơn sản phẩm gắn bài', async () => {
    const other = '33333333-3333-4333-8333-333333333333';
    const h = harness([turn2]);
    const resolve = vi.fn();
    await runPipeline(
      {
        ...base,
        text: 'M đen',
        convo: {
          context: { turns: [], otherQuestions: [] },
          postProductIds: [other],
          postProductNames: ['X'],
          state: { productIds: [PRODUCT], pendingAsks: [] },
        },
      },
      h.deps(knowledge({ resolve })),
    );
    expect(resolve).toHaveBeenCalledWith([PRODUCT]);
  });

  it('nguồn không có resolveProducts (ô Thử AI mẫu) → bỏ qua dự phòng, không lỗi', async () => {
    const h = harness([extract({ asks: ['giá'] })]);
    const k = { ...knowledge(), resolveProducts: undefined };
    const r = done(
      await runPipeline(
        {
          ...base,
          text: 'giá bn?',
          convo: {
            context: { turns: [], otherQuestions: [] },
            postProductIds: [PRODUCT],
            postProductNames: [],
            state: null,
          },
        },
        h.deps(k),
      ),
    );
    expect(r.resolvedProductIds).toEqual([]);
  });
});

describe('FR-167 — câu chốt khi chạm trần (không extract, không tìm kiếm, không sự kiện)', () => {
  it('chạm trần → redirect mời nhắn tin + Cần hỗ trợ thêm; extractor KHÔNG được gọi; nguồn rỗng', async () => {
    const h = harness([turn1]);
    const r = done(await runPipeline({ ...base, replyCap: { count: 2, max: 3 } }, h.deps()));
    expect(h.calls.extractHistory).toHaveLength(0);
    expect(r.decision).toMatchObject({
      action: 'redirect',
      reason: 'customer_post_reply_cap',
      needsSupportTag: true,
      redirectTemplates: ['other'],
    });
    expect(h.calls.draftInputs).toHaveLength(1);
    expect(h.calls.draftInputs[0]?.sources).toEqual([]);
    expect(r.candidates).toEqual([]);
    expect(r.resolvedProductIds).toEqual([]);
  });

  it('chưa chạm trần → chạy bình thường (extract được gọi)', async () => {
    const h = harness([turn1]);
    await runPipeline({ ...base, replyCap: { count: 1, max: 3 } }, h.deps());
    expect(h.calls.extractHistory).toHaveLength(1);
  });
});

describe('lịch sử đầy đủ đi tới extract và bước soạn (đã che PII)', () => {
  it('bình luận cha, caption, câu hỏi ở bài khác, lượt trước → đúng trong history của draft', async () => {
    const h = harness([turn1]);
    await runPipeline(
      {
        ...base,
        convo: {
          context: {
            turns: [
              {
                from: 'customer',
                text: unsafeMarkMasked('lượt trước'),
                at: new Date('2026-11-07T01:00:00Z'),
              },
            ],
            otherQuestions: [
              {
                postId: 'p2',
                text: unsafeMarkMasked('bài khác có ship không'),
                at: new Date('2026-11-06T01:00:00Z'),
              },
            ],
          },
          parentComment: unsafeMarkMasked('bình luận gốc'),
          postCaption: unsafeMarkMasked('Áo thun basic mùa hè'),
          postProductIds: [],
          postProductNames: [],
          state: null,
        },
      },
      h.deps(),
    );
    expect(h.calls.draftInputs[0]?.history).toEqual({
      turns: [{ from: 'customer', text: 'lượt trước' }],
      otherQuestions: ['bài khác có ship không'],
      parentComment: 'bình luận gốc',
      postCaption: 'Áo thun basic mùa hè',
    });
  });
});
