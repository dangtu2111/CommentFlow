import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftInput } from '../draft/draft-prompt';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import type { FactTopic, PolicyFacts } from '../fact-plan';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineInput, runPipeline } from './run-pipeline';

/** ADR 018 T2/T4 (cờ `guardFacts`): guard theo chủ đề + gọi lại bộ soạn khi nháp rỗng mà có nguồn. Cờ TẮT = hành vi cũ. */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const policy: PolicyFacts = {
  shipping: [
    {
      kind: 'nationwide',
      label: 'Toàn quốc',
      feeMinor: 30000,
      currency: 'VND',
      daysMin: 2,
      daysMax: 4,
      sourceId: 'policy:ship',
    },
  ],
};
const factSlots: NonNullable<PipelineInput['factSlots']> = {
  policy,
  stock: { disclose: 'status', lowAt: null },
};
const chunk = (over: Partial<TryCandidate>): TryCandidate => ({
  id: 'kb:ship',
  kind: 'kb',
  title: 'Vận chuyển',
  text: unsafeMarkMasked('Giao toàn quốc, phí 30.000đ, 2-4 ngày.'),
  score: 0.9,
  topics: ['shipping'],
  ...over,
});
const draftOf = (over: Partial<DraftResult> = {}): DraftResult => ({
  reply: '',
  lang: 'vi',
  sources: [],
  claims: [],
  unanswered_topics: [],
  needs_human: true,
  reason: 'x',
  variants: [],
  ...over,
});

async function run(opts: {
  flag: boolean;
  text?: string;
  topics?: FactTopic[];
  chunks: TryCandidate[];
  drafts: DraftResult[];
  withPlan?: boolean;
}) {
  const inputs: DraftInput[] = [];
  let i = 0;
  const drafter: Drafter = {
    async draft(input) {
      inputs.push(input);
      if (input.decision?.action === 'handoff') return draftOf({ reason: 'handoff' });
      const d = opts.drafts[Math.min(i, opts.drafts.length - 1)] as DraftResult;
      i += 1;
      return d;
    },
  };
  const knowledge: TryKnowledge = {
    matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
    lookupProductFacts: async () => [],
    lookupPlanProducts: async () => [],
    searchKb: async () => opts.chunks,
  };
  const text = opts.text ?? 'phi ship bao nhieu vay shop';
  const result = await runPipeline(
    {
      workspaceId: 'ws1',
      text,
      kbVersion: 'v1',
      voice,
      autoSendEnabled: true,
      ...(opts.withPlan === false ? {} : { factSlots }),
      ...(opts.flag ? { guardFacts: true } : {}),
    },
    {
      extractor: createFixtureExtractor([
        {
          match: /./,
          result: {
            ...FIXTURE_EXTRACT_DEFAULT,
            labels: [{ label: 'advice' }] as never,
            asks: [text],
            topics: opts.topics ?? [],
          },
        },
      ]),
      drafter,
      knowledge,
    },
  );
  if (result.status !== 'done') throw new Error(`expected done, got ${result.status}`);
  return { result, inputs };
}

const notHandoff = (inputs: DraftInput[]) => inputs.filter((x) => x.decision?.action !== 'handoff');

describe('T4: nháp rỗng mà có nguồn → gọi lại 1 lần kèm mã lỗi', () => {
  const good = draftOf({
    reply: 'Dạ phí ship 30.000đ, giao 2-4 ngày ạ.',
    needs_human: false,
    sources: ['kb:ship'],
    claims: [{ text: 'phí ship 30.000đ', source_ids: ['kb:ship'], kind: 'fact' }],
  });

  it('cờ BẬT: lần 1 rỗng, lần 2 có câu → dùng câu lần 2, đúng 2 lần gọi, lần 2 mang retryCode', async () => {
    const { result, inputs } = await run({
      flag: true,
      chunks: [chunk({})],
      drafts: [draftOf(), good],
    });
    expect(notHandoff(inputs)).toHaveLength(2);
    expect(inputs[0]?.retryCode).toBeUndefined();
    expect(inputs[1]?.retryCode).toBe('draft_empty_with_sources');
    expect(result.reply).toContain('30.000đ');
    expect(result.guardFacts?.retry).toEqual({ code: 'draft_empty_with_sources', recovered: true });
  });

  it('cờ BẬT: lần 2 vẫn rỗng → không gọi lần 3; có thẻ plan → câu dự phòng do code dựng (không chuyển người)', async () => {
    const { result, inputs } = await run({
      flag: true,
      topics: ['ship_fee'],
      chunks: [chunk({})],
      drafts: [draftOf()],
    });
    expect(notHandoff(inputs)).toHaveLength(2);
    expect(result.guardFacts?.retry?.recovered).toBe(false);
    expect(result.decision.action).toBe('answer');
    expect(result.reply).toContain('30.000');
  });

  it('cờ BẬT: lần 2 vẫn rỗng, không có thẻ plan → chuyển người (FR-140)', async () => {
    const { result } = await run({
      flag: true,
      withPlan: false,
      chunks: [chunk({})],
      drafts: [draftOf()],
    });
    expect(result.decision.action).toBe('handoff');
  });

  it('cờ TẮT: không gọi lại (hành vi cũ)', async () => {
    const { result, inputs } = await run({
      flag: false,
      withPlan: false,
      chunks: [chunk({})],
      drafts: [draftOf(), good],
    });
    expect(inputs.every((x) => x.retryCode === undefined)).toBe(true);
    expect(result.guardFacts).toBeUndefined();
    expect(result.decision.action).toBe('handoff');
  });

  it('không có đoạn cùng chủ đề và không có plan bắt buộc → không gọi lại', async () => {
    const { inputs } = await run({
      flag: true,
      withPlan: false,
      chunks: [chunk({ topics: ['size'] })],
      drafts: [draftOf()],
    });
    expect(inputs.every((x) => x.retryCode === undefined)).toBe(true);
  });
});

describe('T2: nguồn số của guard tiền = đoạn cùng chủ đề', () => {
  const reply = (sources: string[]) =>
    draftOf({
      reply: 'Dạ phí ship 30.000đ ạ.',
      needs_human: false,
      sources,
      claims: [{ text: 'phí ship 30.000đ', source_ids: sources, kind: 'fact' }],
    });
  const otherTopic = (id: string, text: string) =>
    chunk({ id, text: unsafeMarkMasked(text), topics: ['size'] });

  it('số đúng ở đoạn cùng chủ đề nhưng bộ soạn khai thiếu nguồn: cờ TẮT bị bắt oan, cờ BẬT không', async () => {
    const chunks = [chunk({ id: 'kb:ship' }), otherTopic('kb:other', 'Cửa hàng mở cửa 8h.')];
    const off = await run({ flag: false, chunks, drafts: [reply(['kb:other'])] });
    const on = await run({ flag: true, chunks, drafts: [reply(['kb:other'])] });
    expect(off.result.guard.violations.length).toBeGreaterThan(0);
    expect(on.result.guard.violations).toEqual([]);
    expect(on.result.guardFacts?.moneySources).toEqual({ added: 1 });
  });

  it('số chỉ nằm ở đoạn KHÁC chủ đề mà bộ soạn không dùng → vẫn vi phạm, kèm mã number_not_in_topic', async () => {
    const chunks = [
      chunk({ id: 'kb:ship', text: unsafeMarkMasked('Giao toàn quốc 2-4 ngày.') }),
      otherTopic('kb:other', 'Phí gói quà 30.000đ.'),
    ];
    const { result } = await run({ flag: true, chunks, drafts: [reply(['kb:ship'])] });
    expect(result.guard.violations.length).toBeGreaterThan(0);
    expect(result.guardFacts?.numberNotInTopic?.length).toBeGreaterThan(0);
  });

  it('đoạn đã dùng thuộc chủ đề khác vẫn là nguồn hợp lệ (không bắt oan câu đúng nguồn: hỏi COD, trả phí ship từ đoạn ship)', async () => {
    const chunks = [otherTopic('kb:other', 'Phí ship 30.000đ toàn quốc.')];
    const { result } = await run({ flag: true, chunks, drafts: [reply(['kb:other'])] });
    expect(result.guard.violations).toEqual([]);
  });

  it('cờ TẮT: không có dấu vết guardFacts', async () => {
    const { result } = await run({
      flag: false,
      chunks: [chunk({})],
      drafts: [reply(['kb:ship'])],
    });
    expect(result.guardFacts).toBeUndefined();
  });
});
