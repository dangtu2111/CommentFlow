import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import type { FactTopic, PlanProduct, PolicyFacts } from '../fact-plan';
import type { TryKnowledge } from '../try/try-pipeline';
import { runPipeline } from './run-pipeline';

/**
 * FACT-QUALITATIVE + nhóm (6): 7 câu sswiftly (06, 08–13) từng bị chuyển hướng vì chính sách chỉ có văn xuôi ("không có số = unknown"). Với sự kiện định tính (enum) + chủ đề do extract trả,
 * mỗi câu thành `answer` bằng sự kiện do CODE điền (LLM chỉ viết chỗ giữ chỗ, ở đây mô phỏng bằng câu bị từ chối để lấy câu dự phòng do code dựng). Mẫu hàng lỗi → chuyển người.
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'you' as const };
const policy: PolicyFacts = {
  shipping: [
    {
      kind: 'nationwide',
      label: 'United States',
      feeMinor: null,
      currency: 'USD',
      daysMin: null,
      daysMax: null,
      feeMode: 'at_checkout',
      daysMode: 'at_checkout',
      destinations: ['US'],
      sourceId: 'pf:us',
    },
  ],
  returns: {
    days: null,
    refundTo: 'original_payment',
    returnShippingPaidBy: 'customer_change_of_mind',
    eligibility: 'varies_by_item',
    sourceId: 'pf:ret',
  },
};
const box: PlanProduct = {
  id: 'p-box',
  name: 'Automatic litter box',
  currency: 'USD',
  priceMinor: 43999,
  stock: 3,
  variants: [],
};
const knowledge: TryKnowledge = {
  matchProducts: async (mentions) =>
    mentions.some((m) => m.includes('litter'))
      ? { ids: ['p-box'], names: ['Automatic litter box'], missingAxes: [] }
      : { ids: [], names: [], missingAxes: [] },
  lookupProductFacts: async () => [
    {
      id: 'p-box',
      kind: 'product',
      title: 'Automatic litter box',
      text: unsafeMarkMasked('Automatic litter box: price $439.99.'),
      score: 0.95,
      topics: ['product_info'],
    },
  ],
  lookupPlanProducts: async (ids) => (ids.includes('p-box') ? [box] : []),
  searchKb: async () => [],
};
// Bộ soạn giả: luôn trả câu KHÔNG hợp lệ (chữ số ngoài chỗ giữ chỗ) → code dùng câu dự phòng do chính nó dựng.
const drafter: Drafter = {
  async draft(input) {
    if (input.decision?.action === 'handoff') {
      return { ...base(''), needs_human: true, reason: 'handoff' };
    }
    return base('Sure, 100% yes.');
  },
};
const base = (reply: string): DraftResult => ({
  reply,
  lang: 'en',
  sources: [],
  claims: [],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
});

const ask = async (
  text: string,
  topics: FactTopic[],
  over: Partial<ExtractResult> = {},
  pol: PolicyFacts = policy,
) => {
  const result = await runPipeline(
    {
      workspaceId: 'ws1',
      text,
      kbVersion: 'v1',
      voice,
      autoSendEnabled: true,
      factSlots: { policy: pol, stock: { disclose: 'status', lowAt: null } },
    },
    {
      extractor: createFixtureExtractor([
        {
          match: /./,
          result: {
            ...FIXTURE_EXTRACT_DEFAULT,
            labels: [{ label: 'advice' }],
            asks: [text],
            topics,
            ...over,
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

describe('7 câu sswiftly: sự kiện định tính → answer bằng sự kiện (không chuyển hướng, không văn xuôi)', () => {
  it('06 "Do you ship to Canada?" → giao tới nơi nào (không phủ định)', async () => {
    const r = await ask('Do you ship to Canada?', ['ship_destination'], { destination: 'Canada' });
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('we currently ship to the United States');
    expect(r.reply).not.toMatch(/\bcannot\b|\bdon't ship\b/i);
  });
  it('08 "can i return it if i don\'t like it?" → điều kiện đổi trả tùy sản phẩm', async () => {
    const r = await ask("can i return it if i don't like it?", ['return_eligibility']);
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('depends on the item');
    expect(r.factPlan?.unknownTopics).toEqual([]);
  });
  it('09 "who pays for return shipping if I change my mind?" → return_shipping, KHÔNG kéo returns.days', async () => {
    const r = await ask('who pays for return shipping if I change my mind?', ['return_shipping']);
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('the customer pays return shipping');
    expect(r.factPlan?.facts.map((f) => f.id)).toEqual(['return_shipping']);
  });
  it('10 "If I get a refund does it go back to my card?" → refund_to, không kéo returns.days', async () => {
    const r = await ask('If I get a refund does it go back to my card?', ['refund_to']);
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('refunds go back to the original payment method');
    expect(r.factPlan?.facts.map((f) => f.id)).toEqual(['refund_to']);
  });
  it('11 giá + giao tới Hawaii → giá do code điền + Hawaii ∈ US; câu mời không lặp', async () => {
    const r = await ask(
      'how much is the automatic litter box and do you ship to Hawaii?',
      ['price', 'ship_destination'],
      {
        destination: 'Hawaii',
        product_mentions: ['automatic litter box'],
        labels: [{ label: 'price' }],
      },
    );
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('$439.99');
    expect(r.reply).toContain('we ship to the United States');
    expect(r.reply.match(/message/gi) ?? []).toHaveLength(0);
  });
  it('12 "how much is shipping to Texas?" → phí tính khi thanh toán', async () => {
    const r = await ask('how much is shipping to Texas?', ['ship_fee'], { destination: 'Texas' });
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('calculated at checkout');
  });
  it('13 "can I get free shipping?" → phí ship tính khi thanh toán (không hứa miễn phí)', async () => {
    const r = await ask('can I get free shipping?', ['ship_fee']);
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('calculated at checkout');
    expect(r.reply).not.toMatch(/free\b/i);
  });
});

describe('defect (hàng lỗi/sai hàng) — chủ đề riêng, KHÔNG dùng returns.days/conditions → chuyển người', () => {
  it.each([
    ['Nếu hàng lỗi thì shop có hoàn tiền không?'],
    ['My item arrived damaged, can I get a refund?'],
    ['Shop giao sai hàng rồi'],
  ])('%s', async (text) => {
    const r = await ask(
      text,
      ['defect'],
      {},
      {
        shipping: [],
        returns: { days: 7, conditions: ['còn tem mác', 'chưa giặt'], sourceId: 'pf:r' },
      },
    );
    expect(r.decision.action).toBe('handoff');
    expect(r.reply).toBe('');
  });
  it('"guarantee a refund" → returns/refund_to, KHÔNG phải warranty (chủ đề do extract trả)', async () => {
    const r = await ask('do you guarantee a refund within 30 days?', ['refund_to']);
    expect(r.factPlan?.facts.map((f) => f.kind)).toEqual(['refund_to']);
  });
});

describe('FR-160: cam kết hoàn tiền / khẳng định quy định → chuyển người (en-23, en-24)', () => {
  it('en-23 "Is the mole removal pen FDA approved?" → handoff legal_unsourced', async () => {
    const r = await ask('Is the mole removal pen FDA approved?', []);
    expect(r.decision).toMatchObject({ action: 'handoff', reason: 'legal_unsourced' });
    expect(r.riskReasons.legal).toContain('regulatory_claim');
  });
  it('en-24 "do you guarantee a refund if it does not work within 30 days?" → handoff dù plan có sự kiện đổi trả', async () => {
    const r = await ask('do you guarantee a refund if it does not work within 30 days?', [
      'refund_to',
    ]);
    expect(r.decision).toMatchObject({ action: 'handoff', reason: 'legal_unsourced' });
    expect(r.riskReasons.legal).toContain('refund_guarantee');
  });
  it('câu hỏi trả hàng thông thường (không cam kết) vẫn answer', async () => {
    const r = await ask("can I return it if I don't like it?", ['return_eligibility']);
    expect(r.decision.action).toBe('answer');
  });
});

describe('LABEL-SECONDARY-COMPLAINT: nhãn phụ complaint không ép chuyển người ở câu hỏi đổi trả thường', () => {
  const both = { labels: [{ label: 'advice' }, { label: 'complaint' }] } as never;
  it('đổi trả thường + sự kiện đổi trả đã biết + nhãn phụ complaint → answer (không cần người duyệt thêm)', async () => {
    const r = await ask("it doesn't fit, can I return it?", ['return_eligibility'], both);
    expect(r.decision.action).toBe('answer');
    expect(r.decision.reason).not.toBe('complaint');
    expect(r.reply).toContain('depends on the item');
  });
  it('nhãn CHÍNH complaint → vẫn chuyển người', async () => {
    const r = await ask("it doesn't fit, can I return it?", ['return_eligibility'], {
      labels: [{ label: 'complaint' }, { label: 'advice' }],
    } as never);
    expect(r.decision).toMatchObject({ action: 'handoff', reason: 'complaint' });
  });
  it('hàng lỗi (defect) → vẫn chuyển người dù nhãn chính advice', async () => {
    const r = await ask(
      'item arrived broken, can I return it?',
      ['defect', 'return_eligibility'],
      both,
    );
    expect(r.decision.action).toBe('handoff');
  });
  it('chưa có sự kiện đổi trả đã biết (shop chưa khai) → vẫn chuyển người', async () => {
    const r = await ask("it doesn't fit, can I return it?", ['return_eligibility'], both, {
      shipping: [],
    });
    expect(r.decision.action).toBe('handoff');
  });
});
