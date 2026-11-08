import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter, DraftInput } from '../draft/drafter';
import { createDemoKnowledge } from '../try/demo-knowledge';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineDeps, type PipelineInput, runPipeline } from './run-pipeline';

/**
 * GUARD-SEMANTIC-SUPPORT ở pipeline: nguồn chỉ có phí ship; bộ soạn "bịa" khẳng định COD / ship quốc tế / trả góp → code loại ý đó, câu chuyển hướng
 * (không câu nào khẳng định); bộ soạn trả lời ĐÚNG (chuyển hướng) thì giữ nguyên.
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const input = (text: string): PipelineInput => ({
  workspaceId: 'ws1',
  text,
  kbVersion: 'v1',
  voice,
  autoSendEnabled: true,
});
const shipChunk: TryCandidate = {
  id: 'kb:ship',
  kind: 'kb',
  title: 'Phí vận chuyển',
  text: unsafeMarkMasked(
    'Phí ship nội thành 20.000đ, toàn quốc 30.000đ. Giao hàng trong 2–4 ngày.',
  ),
  score: 0.9,
  topics: ['shipping', 'other', 'policy'],
};
const knowledge: TryKnowledge = { ...createDemoKnowledge(), searchKb: async () => [shipChunk] };
const extractFor = (ask: string): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  labels: [{ label: 'advice' }],
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

/** Bộ soạn giả: lần có quyết định `answer` → câu bịa; quyết định khác → câu chuyển hướng đúng. Ghi lại các lần gọi. */
function fakeDrafter(bogus: string, honest: string) {
  const calls: DraftInput[] = [];
  const drafter: Drafter = {
    async draft(draftInput) {
      calls.push(draftInput);
      if (draftInput.decision?.action === 'handoff') {
        return reply('', { needs_human: true, sources: [], claims: [], reason: 'handoff' });
      }
      if (draftInput.decision?.action === 'answer') return reply(bogus);
      return reply(honest, { sources: [], claims: [] });
    },
  };
  return { drafter, calls };
}
const deps = (ask: string, drafter: Drafter): PipelineDeps => ({
  extractor: createFixtureExtractor([{ match: /./, result: extractFor(ask) }]),
  drafter,
  knowledge,
});
const run = async (
  text: string,
  bogus: string,
  honest = 'Bạn ơi, shop chưa có thông tin về điều này, bạn ib shop nhé.',
) => {
  const { drafter, calls } = fakeDrafter(bogus, honest);
  const r = await runPipeline(input(text), deps(text, drafter));
  if (r.status !== 'done') throw new Error(`expected done, got ${r.status}`);
  return { r, calls };
};

describe('câu bịa chính sách bị loại, chuyển hướng', () => {
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
  ])('"%s" → không câu nào khẳng định điều nguồn không nêu', async (text, bogus) => {
    const { r, calls } = await run(text, bogus);
    expect(r.decision.action).not.toBe('answer');
    expect(r.reply).not.toMatch(/COD|quốc tế|trả góp/i);
    expect(calls.length).toBeGreaterThanOrEqual(2); // bản nháp đầu bị loại, soạn lại theo quyết định mới
    expect(r.decision.unansweredTopics.length + (r.decision.needsHuman ? 1 : 0)).toBeGreaterThan(0);
  });

  it('bộ soạn đã trả lời ĐÚNG (chuyển hướng ngay từ đầu) → giữ nguyên, không soạn lại', async () => {
    const calls: DraftInput[] = [];
    const drafter: Drafter = {
      async draft(d) {
        calls.push(d);
        return reply('Bạn ơi, shop chưa có thông tin về COD, bạn ib shop nhé.', {
          sources: [],
          claims: [],
        });
      },
    };
    const r = await runPipeline(input('Shop có COD không ạ'), deps('Shop có COD không ạ', drafter));
    if (r.status !== 'done') throw new Error('not done');
    expect(calls).toHaveLength(1);
  });

  it('câu hỏi phí ship (nguồn có phí ship) trả lời bình thường, không bị loại', async () => {
    const { r, calls } = await run(
      'Ship ra tỉnh bao nhiêu tiền vậy ạ',
      'Phí ship toàn quốc 30.000đ bạn nhé.',
    );
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('30.000đ');
    expect(calls).toHaveLength(1);
  });

  it('soạn lại vẫn bịa → chuyển người (handoff claim_unsupported), không lọt câu bịa', async () => {
    const drafter: Drafter = {
      async draft(d) {
        if (d.decision?.action === 'handoff') {
          return reply('', { needs_human: true, sources: [], claims: [], reason: 'handoff' });
        }
        return reply('Shop có hỗ trợ ship COD bạn nhé.'); // luôn bịa, kể cả khi được yêu cầu chuyển hướng
      },
    };
    const r = await runPipeline(input('Shop có COD không ạ'), deps('Shop có COD không ạ', drafter));
    if (r.status !== 'done') throw new Error('not done');
    expect(r.decision).toMatchObject({
      action: 'handoff',
      reason: 'claim_unsupported',
      needsHuman: true,
    });
    expect(r.reply).not.toMatch(/COD/);
  });

  it('chỉ hỏi giá (không có ý chính sách để đánh dấu "chưa nguồn") mà bản nháp bịa COD → chuyển người, không lọt câu bịa', async () => {
    const priceChunk: TryCandidate = { ...shipChunk, topics: ['product_info'] };
    const priceKnowledge: TryKnowledge = {
      ...createDemoKnowledge(),
      searchKb: async () => [priceChunk],
    };
    const { drafter } = fakeDrafter('Giá 199.000đ, có COD nhé bạn.', 'x');
    const priceExtract: ExtractResult = {
      ...FIXTURE_EXTRACT_DEFAULT,
      labels: [{ label: 'price' }],
      asks: ['giá'],
    };
    const r = await runPipeline(input('giá bao nhiêu'), {
      extractor: createFixtureExtractor([{ match: /./, result: priceExtract }]),
      drafter,
      knowledge: priceKnowledge,
    });
    if (r.status !== 'done') throw new Error('not done');
    expect(r.decision).toMatchObject({ action: 'handoff', reason: 'claim_unsupported' });
    expect(r.reply).not.toMatch(/COD/);
  });
});
