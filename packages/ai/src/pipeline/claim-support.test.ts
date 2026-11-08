import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter, DraftInput } from '../draft/drafter';
import { checkConceptSupport } from '../guard-support';
import { createDemoKnowledge } from '../try/demo-knowledge';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineDeps, type PipelineInput, runPipeline } from './run-pipeline';

/**
 * GUARD-SEMANTIC-SUPPORT ở pipeline: nguồn chỉ có phí ship; bộ soạn "bịa" khẳng định COD / ship quốc tế / trả góp → code loại ý đó KHÔNG gọi LLM soạn lại
 * (≤ 1 lần gọi bộ soạn/lượt ở đây; FR-162): chọn biến thể sạch nếu có, không thì câu chuyển hướng theo mẫu, không còn ý để chuyển hướng thì chuyển người.
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const input = (text: string): PipelineInput => ({
  workspaceId: 'ws1',
  text,
  kbVersion: 'v1',
  voice,
  autoSendEnabled: true,
});
const SHIP_TEXT = 'Phí ship nội thành 20.000đ, toàn quốc 30.000đ. Giao hàng trong 2–4 ngày.';
const shipChunk: TryCandidate = {
  id: 'kb:ship',
  kind: 'kb',
  title: 'Phí vận chuyển',
  text: unsafeMarkMasked(SHIP_TEXT),
  score: 0.9,
  topics: ['shipping', 'other', 'policy'],
};
const knowledgeWith = (chunk: TryCandidate): TryKnowledge => ({
  ...createDemoKnowledge(),
  searchKb: async () => [chunk],
});
const extractFor = (ask: string, label: 'advice' | 'price' = 'advice'): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  labels: [{ label }],
  asks: [ask],
});
const reply = (text: string, over: Partial<DraftResult> = {}): DraftResult => ({
  reply: text,
  lang: 'vi',
  sources: ['kb:ship'],
  claims: [{ text, source_ids: ['kb:ship'], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
  ...over,
});

/** Bộ soạn giả: luôn trả bản nháp cho trước (kèm biến thể); quyết định `handoff` → không có câu (như bộ soạn thật, KHÔNG gọi LLM). */
function fakeDrafter(draft: DraftResult) {
  const calls: DraftInput[] = [];
  const drafter: Drafter = {
    async draft(draftInput) {
      calls.push(draftInput);
      if (draftInput.decision?.action === 'handoff') {
        return reply('', { needs_human: true, sources: [], claims: [], reason: 'handoff' });
      }
      return draft;
    },
  };
  return { drafter, calls };
}
const deps = (ask: string, drafter: Drafter, knowledge: TryKnowledge): PipelineDeps => ({
  extractor: createFixtureExtractor([{ match: /./, result: extractFor(ask) }]),
  drafter,
  knowledge,
});
const run = async (text: string, draft: DraftResult, knowledge = knowledgeWith(shipChunk)) => {
  const { drafter, calls } = fakeDrafter(draft);
  const r = await runPipeline(input(text), deps(text, drafter, knowledge));
  if (r.status !== 'done') throw new Error(`expected done, got ${r.status}`);
  return { r, calls };
};

describe('câu bịa chính sách bị loại, KHÔNG gọi LLM soạn lại', () => {
  it.each([
    [
      'Shop có nhận thanh toán khi nhận hàng không?',
      'Shop có hỗ trợ ship COD bạn nhé. Phí ship 30.000đ.',
    ],
    [
      'shop co nhan thanh toan khi nhan hang khong',
      'Shop có hỗ trợ ship COD bạn nhé. Phí ship 30.000đ.',
    ],
    ['Shop có COD không ạ', 'Dạ có COD ạ, toàn quốc.'],
    ['hệ thống bên mình có ship COD không', 'Có ship COD nhé bạn.'],
    ['Shop có ship quốc tế không?', 'Shop có ship quốc tế bạn nhé.'],
    ['Có trả góp không shop?', 'Shop có hỗ trợ trả góp 0% bạn nhé.'],
  ])(
    '"%s" → câu chuyển hướng theo mẫu, đúng 1 lần gọi bộ soạn, không câu nào khẳng định',
    async (text, bogus) => {
      const { r, calls } = await run(text, reply(bogus));
      expect(calls).toHaveLength(1);
      expect(r.decision.action).toBe('redirect');
      expect(r.decision.reason).toBe('topic_unsourced');
      expect(r.reply).toMatch(/chưa có thông tin/);
      expect(checkConceptSupport({ reply: r.reply, sources: [SHIP_TEXT] }).ok).toBe(true);
      expect(r.reply).not.toMatch(/có hỗ trợ|Dạ có|Có ship|có ship/i);
      expect(r.draft.sources).toEqual([]);
    },
  );

  it('có BIẾN THỂ sạch (FR-161) → dùng biến thể đó, không gọi LLM thêm; ý bị loại khỏi claims', async () => {
    const draft = reply('Shop có COD bạn nhé. Phí ship toàn quốc 30.000đ.', {
      claims: [
        { text: 'Shop có COD', source_ids: ['kb:ship'], kind: 'fact' },
        { text: 'Phí ship toàn quốc 30.000đ', source_ids: ['kb:ship'], kind: 'fact' },
      ],
      variants: ['Dạ có COD ạ, ship 30.000đ.', 'Phí ship toàn quốc 30.000đ bạn nhé.'],
    });
    const { r, calls } = await run('Ship tỉnh COD không ạ', draft);
    expect(calls).toHaveLength(1);
    expect(r.reply).toBe('Phí ship toàn quốc 30.000đ bạn nhé.');
    expect(r.draft.claims.map((c) => c.text)).toEqual(['Phí ship toàn quốc 30.000đ']);
    expect(r.draft.variants).toEqual([]);
  });

  it('bản nháp đã trả lời ĐÚNG (chuyển hướng ngay từ đầu) → giữ nguyên, 1 lần gọi', async () => {
    const honest = reply('Bạn ơi, shop chưa có thông tin về COD, bạn ib shop nhé.', {
      sources: [],
      claims: [],
    });
    const { r, calls } = await run('Shop có COD không ạ', honest);
    expect(calls).toHaveLength(1);
    expect(r.reply).toBe(honest.reply);
  });

  it('câu hỏi phí ship (nguồn có phí ship) trả lời bình thường, không bị loại', async () => {
    const { r, calls } = await run(
      'Ship ra tỉnh bao nhiêu tiền vậy ạ',
      reply('Phí ship toàn quốc 30.000đ bạn nhé.'),
    );
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('30.000đ');
    expect(calls).toHaveLength(1);
  });

  it('nguồn nói KHÔNG (chiều phủ định) mà bản nháp nói CÓ → bị loại', async () => {
    const noCod: TryCandidate = {
      ...shipChunk,
      text: unsafeMarkMasked(
        'Shop chưa hỗ trợ COD, vui lòng chuyển khoản trước. Phí ship 30.000đ.',
      ),
    };
    const { r } = await run(
      'Shop có COD không ạ',
      reply('Shop có hỗ trợ COD bạn nhé.'),
      knowledgeWith(noCod),
    );
    expect(r.reply).not.toMatch(/có hỗ trợ COD/);
    expect(r.decision.action).not.toBe('answer');
  });

  it('chỉ hỏi giá (không có ý chính sách để đánh dấu "chưa nguồn") mà bản nháp bịa COD → chuyển người, không lọt câu bịa, không gọi LLM thêm', async () => {
    const priceChunk: TryCandidate = { ...shipChunk, topics: ['product_info'] };
    const { drafter, calls } = fakeDrafter(reply('Giá 199.000đ, có COD nhé bạn.'));
    const r = await runPipeline(input('giá bao nhiêu'), {
      extractor: createFixtureExtractor([{ match: /./, result: extractFor('giá', 'price') }]),
      drafter,
      knowledge: knowledgeWith(priceChunk),
    });
    if (r.status !== 'done') throw new Error('not done');
    expect(r.decision).toMatchObject({ action: 'handoff', reason: 'claim_unsupported' });
    expect(r.reply).not.toMatch(/COD/);
    // 1 lần soạn thật + 1 lần gọi với quyết định handoff (bộ soạn trả ngay, KHÔNG gọi LLM).
    expect(calls.map((c) => c.decision?.action)).toEqual(['answer', 'handoff']);
  });
});
