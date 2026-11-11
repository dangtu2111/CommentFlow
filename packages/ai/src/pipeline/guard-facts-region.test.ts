import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftInput } from '../draft/draft-prompt';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import { mentionsShipNumbers, type PolicyFacts, regionClarifyText } from '../fact-plan';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineInput, runPipeline } from './run-pipeline';

/**
 * ADR 018 T1 (cờ `guardFacts`): khách ở tỉnh, thẻ ship chỉ có "nội thành Hà Nội" → mọi số phí/thời gian trong câu là áp sai khu vực.
 * Gọi lại 1 lần kèm `region_mismatch`; vẫn nêu số → câu hỏi khu vực do CODE viết (clarify, FR-147). Cờ TẮT: hành vi cũ.
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const cityOnly: PolicyFacts = {
  shipping: [
    {
      kind: 'city',
      label: 'Nội thành Hà Nội',
      city: 'Hà Nội',
      feeMinor: 20000,
      currency: 'VND',
      daysMin: 1,
      daysMax: 2,
      sourceId: 'policy:ship-hn',
    },
  ],
};
const factSlots: NonNullable<PipelineInput['factSlots']> = {
  policy: cityOnly,
  stock: { disclose: 'status', lowAt: null },
};
const chunk: TryCandidate = {
  id: 'kb:ship',
  kind: 'kb',
  title: 'Vận chuyển',
  text: unsafeMarkMasked('Nội thành Hà Nội phí ship 20.000đ, giao trong 1-2 ngày.'),
  score: 0.9,
  topics: ['shipping'],
};
const draftOf = (reply: string): DraftResult => ({
  reply,
  lang: 'vi',
  sources: ['kb:ship'],
  claims: [{ text: reply, source_ids: ['kb:ship'], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
});
const WRONG = 'Dạ phí ship 20.000đ, giao trong 1-2 ngày ạ.';
const SAFE = 'Dạ shop cần xác nhận khu vực của bạn trước, bạn nhắn shop giúp mình nhé.';

async function run(text: string, flag: boolean, drafts: string[]) {
  const inputs: DraftInput[] = [];
  let i = 0;
  const drafter: Drafter = {
    async draft(input) {
      inputs.push(input);
      const reply = drafts[Math.min(i, drafts.length - 1)] as string;
      i += 1;
      return draftOf(reply);
    },
  };
  const knowledge: TryKnowledge = {
    matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
    lookupProductFacts: async () => [],
    lookupPlanProducts: async () => [],
    searchKb: async () => [chunk],
  };
  const result = await runPipeline(
    {
      workspaceId: 'ws1',
      text,
      kbVersion: 'v1',
      voice,
      autoSendEnabled: true,
      factSlots,
      ...(flag ? { guardFacts: true } : {}),
    },
    {
      extractor: createFixtureExtractor([
        {
          match: /./,
          result: {
            ...FIXTURE_EXTRACT_DEFAULT,
            labels: [{ label: 'advice' }] as never,
            asks: [text],
            topics: ['ship_fee'],
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

const PROVINCE = 'ship về Nghệ An bao nhiêu vậy shop';

describe('T1: khu vực không khớp thẻ ship', () => {
  it('cờ BẬT: nháp nêu phí cho tỉnh → gọi lại 1 lần kèm region_mismatch; lần 2 không nêu số → dùng lần 2', async () => {
    const { result, inputs } = await run(PROVINCE, true, [WRONG, SAFE]);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]?.retryCode).toBe('region_mismatch');
    expect(result.reply).toBe(SAFE);
    expect(result.guardFacts?.region).toEqual({ retried: true, outcome: 'recovered' });
    expect(result.regionMismatch).toEqual({ topics: expect.any(Array), numberInReply: false });
  });

  it('cờ BẬT: lần 2 vẫn nêu số → câu hỏi khu vực do code viết, hành động clarify, KHÔNG gọi lần 3', async () => {
    const { result, inputs } = await run(PROVINCE, true, [WRONG]);
    expect(inputs).toHaveLength(2);
    expect(result.decision.action).toBe('clarify');
    expect(result.reply).toBe(regionClarifyText('vi', { shop: 'shop', customer: 'bạn' }));
    expect(result.reply).not.toMatch(/20\.000/);
    expect(result.guardFacts?.region).toEqual({ retried: true, outcome: 'clarify' });
    expect(result.regionMismatch?.numberInReply).toBe(false);
  });

  it('cờ TẮT: giữ nguyên câu sai khu vực (hành vi cũ) nhưng chẩn đoán regionMismatch vẫn đo được', async () => {
    const { result, inputs } = await run(PROVINCE, false, [WRONG]);
    expect(inputs).toHaveLength(1);
    expect(result.reply).toBe(WRONG);
    expect(result.guardFacts).toBeUndefined();
    expect(result.regionMismatch?.numberInReply).toBe(true);
  });

  it('khách ở đúng khu vực thẻ (Hà Nội) → không can thiệp, không có regionMismatch', async () => {
    const { result, inputs } = await run('ship nội thành Hà Nội bao nhiêu vậy shop', true, [WRONG]);
    expect(inputs).toHaveLength(1);
    expect(result.reply).toBe(WRONG);
    expect(result.regionMismatch).toBeUndefined();
  });

  it('khách không nêu nơi nào → không phải khu vực không khớp (đường hỏi tỉnh/thành cũ)', async () => {
    const { result } = await run('ship bao nhiêu vậy shop', true, [WRONG]);
    expect(result.guardFacts?.region).toBeUndefined();
  });
});

describe('helper T1', () => {
  it('mentionsShipNumbers: nhận số tiền/ngày, bỏ qua số không đơn vị', () => {
    for (const text of ['phí 20.000đ', 'giao 2-4 ngày', '30k', 'costs $5', 'in 3 days']) {
      expect(mentionsShipNumbers(text)).toBe(true);
    }
    for (const text of ['size 29', 'không có số', 'kg']) {
      expect(mentionsShipNumbers(text)).toBe(false);
    }
  });

  it('regionClarifyText: vi/en, không có số', () => {
    expect(regionClarifyText('vi', { shop: 'em', customer: 'anh/chị' })).toContain('anh/chị');
    expect(regionClarifyText('en', { shop: 'we', customer: 'you' })).toContain('we');
    expect(regionClarifyText('en', { shop: 'Acme', customer: 'you' })).toContain('Acme');
    expect(mentionsShipNumbers(regionClarifyText('vi', { shop: 'shop', customer: 'bạn' }))).toBe(
      false,
    );
  });
});
