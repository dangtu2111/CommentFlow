import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import type { PlanProduct } from '../fact-plan';
import type { TryKnowledge } from '../try/try-pipeline';
import { runPipeline } from './run-pipeline';

/**
 * Hồi quy en-15 (EVAL sswiftly): câu hỏi chọn biến thể liệt kê mã biến thể của CHÍNH sản phẩm đã nhận diện ("WMT8050PAPER", "WMT802ROLL").
 * Số trong mã (8050, 802) đọc từ product_variants, không phải số tiền AI bịa → guard tiền KHÔNG được báo "Sai giá".
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const product: PlanProduct = {
  id: 'p1',
  name: 'A4 Portable Printer',
  currency: 'USD',
  priceMinor: null,
  stock: null,
  variants: ['WMT8050PAPER', 'MT80W', 'WMT802ROLL'].map((label) => ({
    label,
    attrsNorm: { color: label.toLowerCase() },
    priceMinor: null,
    stock: null,
  })),
};
const knowledge: TryKnowledge = {
  matchProducts: async () => ({ ids: ['p1'], names: [product.name], missingAxes: ['color'] }),
  lookupProductFacts: async () => [],
  lookupPlanProducts: async () => [product],
  searchKb: async () => [],
};
const draftOf = (reply: string): DraftResult => ({
  reply,
  lang: 'en',
  sources: [],
  claims: [],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
});
const run = async (reply: string) => {
  const drafter: Drafter = { draft: async () => draftOf(reply) };
  const result = await runPipeline(
    {
      workspaceId: 'ws1',
      text: unsafeMarkMasked('does the a4 printer work with my phone?'),
      kbVersion: 'v1',
      voice,
      autoSendEnabled: true,
    },
    {
      extractor: createFixtureExtractor([
        {
          match: /./,
          result: {
            ...FIXTURE_EXTRACT_DEFAULT,
            labels: [{ label: 'advice' }] as never,
            asks: ['compat'],
          },
        },
      ]),
      drafter,
      knowledge,
    },
  );
  if (result.status !== 'done') throw new Error(`expected done, got ${result.status}`);
  return result;
};

describe('guard tiền: số trong nhãn biến thể của sản phẩm đã nhận diện', () => {
  it('en-15: liệt kê mã biến thể → không có vi phạm tiền', async () => {
    const r = await run('Which color variant would you like: WMT8050PAPER, MT80W, or WMT802ROLL?');
    expect(r.guard.violations).toEqual([]);
  });

  it('số KHÔNG thuộc nhãn biến thể nào vẫn bị chặn', async () => {
    const r = await run('Which variant: WMT8050PAPER, or the one at 8051?');
    expect(r.guard.violations.map((v) => v.display)).toContain('8051');
  });
});
