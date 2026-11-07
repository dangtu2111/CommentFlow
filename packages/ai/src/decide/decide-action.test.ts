import { COMMENT_LABELS } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACTION_KINDS } from '../confidence/confidence';
import {
  type DecideActionInput,
  decideAction,
  effectiveAutoSendPolicy,
  KB_GAP_TOPICS,
  MAX_CLARIFY_OPTIONS,
  MAX_CLARIFY_PER_THREAD,
  REPEAT_HANDOFF_THRESHOLD,
  readDecideActionInput,
} from './decide-action';

const NO_RISK = {
  priceConflict: false,
  legalUnsourced: false,
  impersonation: false,
  stockStale: false,
  injectionSuspected: false,
} as const;

/** Ca mốc: một sản phẩm đã nhận, khách hỏi giá, nguồn có → trả lời. */
function base(over: Partial<DecideActionInput> = {}): DecideActionInput {
  return {
    lang: 'vi',
    extract: {
      labels: [{ label: 'price' }],
      refers_to_image: false,
      size: null,
      color: null,
      height_cm: null,
      weight_kg: null,
    },
    products: { candidates: ['Áo thun A'], missingAxes: [] },
    topics: [{ topic: 'product_info', sourced: true }],
    thread: { clarifyCount: 0, repeatCount: 0 },
    risks: NO_RISK,
    ...over,
  };
}

describe('FR-147 decideAction — bậc 1: trả lời khi mọi ý có nguồn', () => {
  it('mọi ý có nguồn, không thiếu thông tin → answer, cổng chuẩn, không tag', () => {
    const d = decideAction(base());
    expect(d).toMatchObject({
      action: 'answer',
      reason: 'all_sourced',
      needsHuman: false,
      needsSupportTag: false,
      clarify: null,
      answeredTopics: ['product_info'],
      unansweredTopics: [],
      redirectTemplates: [],
      autoSendPolicy: 'standard',
      askedBefore: false,
    });
  });

  it('không có ý nào nhưng sản phẩm đã nhận và không thiếu trục → answer', () => {
    expect(decideAction(base({ topics: [] })).action).toBe('answer');
  });

  it('đã hỏi lại một lần trước đó → askedBefore = true (tín hiệu §6.0)', () => {
    const d = decideAction(base({ thread: { clarifyCount: 1, repeatCount: 0 } }));
    expect(d.action).toBe('answer');
    expect(d.askedBefore).toBe(true);
  });
});

describe('FR-147 decideAction — bậc 2: hỏi lại khách (thiếu thông tin phía khách)', () => {
  it('bài gắn nhiều sản phẩm, khách hỏi giá → hỏi mẫu nào, gợi ý tối đa 3 lựa chọn', () => {
    const d = decideAction(
      base({ products: { candidates: ['Áo A', 'Áo B', 'Áo C', 'Áo D'], missingAxes: [] } }),
    );
    expect(d.action).toBe('clarify');
    expect(d.reason).toBe('product_ambiguous');
    expect(d.clarify).toEqual({ ask: 'product', axes: [], options: ['Áo A', 'Áo B', 'Áo C'] });
    expect(d.clarify?.options).toHaveLength(MAX_CLARIFY_OPTIONS);
    expect(d.autoSendPolicy).toBe('allow_clarify');
    expect(d.needsHuman).toBe(false);
  });

  it('nhiều sản phẩm nhưng khách chỉ hỏi chính sách giao hàng → không hỏi mẫu, trả lời', () => {
    const d = decideAction(
      base({
        extract: { ...base().extract, labels: [{ label: 'advice' }] },
        products: { candidates: ['Áo A', 'Áo B'], missingAxes: [] },
        topics: [{ topic: 'shipping', sourced: true }],
      }),
    );
    expect(d.action).toBe('answer');
  });

  it('một sản phẩm, biến thể khác giá theo size và màu, khách chưa nói → hỏi biến thể (FR-158 bậc 2)', () => {
    const d = decideAction(
      base({ products: { candidates: ['Áo A'], missingAxes: ['size', 'color'] } }),
    );
    expect(d.action).toBe('clarify');
    expect(d.reason).toBe('variant_missing');
    expect(d.clarify).toEqual({ ask: 'variant', axes: ['size', 'color'], options: [] });
  });

  it('trục khách đã nói thì không hỏi lại: đã nói size → chỉ hỏi màu; nói cả hai → trả lời', () => {
    const saidSize = base({
      extract: { ...base().extract, size: 'M' },
      products: { candidates: ['Áo A'], missingAxes: ['size', 'color'] },
    });
    expect(decideAction(saidSize).clarify).toEqual({
      ask: 'variant',
      axes: ['color'],
      options: [],
    });
    const saidBoth = base({
      extract: { ...base().extract, size: 'M', color: 'đen' },
      products: { candidates: ['Áo A'], missingAxes: ['size', 'color'] },
    });
    expect(decideAction(saidBoth).action).toBe('answer');
  });

  it('hỏi size có bảng size nhưng thiếu chiều cao hoặc cân nặng → hỏi số đo (FR-149)', () => {
    const noMeasure = base({
      extract: { ...base().extract, labels: [{ label: 'advice' }] },
      topics: [{ topic: 'size', sourced: true }],
    });
    const d = decideAction(noMeasure);
    expect(d.action).toBe('clarify');
    expect(d.reason).toBe('body_measure_missing');
    expect(d.clarify?.ask).toBe('body_measure');

    const onlyHeight = decideAction({
      ...noMeasure,
      extract: { ...noMeasure.extract, height_cm: 160 },
    });
    expect(onlyHeight.clarify?.ask).toBe('body_measure');

    const both = decideAction({
      ...noMeasure,
      extract: { ...noMeasure.extract, height_cm: 160, weight_kg: 50 },
    });
    expect(both.action).toBe('answer');
  });

  it('hỏi size mà KHÔNG có bảng size → chuyển hướng (không hỏi số đo vô ích)', () => {
    const d = decideAction(base({ topics: [{ topic: 'size', sourced: false }] }));
    expect(d.action).toBe('redirect');
    expect(d.unansweredTopics).toEqual(['size']);
  });

  it('câu mơ hồ: không nhận ra sản phẩm, không rõ ý → hỏi lại ý định', () => {
    const d = decideAction(base({ products: { candidates: [], missingAxes: [] }, topics: [] }));
    expect(d.action).toBe('clarify');
    expect(d.reason).toBe('question_vague');
    expect(d.clarify).toEqual({ ask: 'intent', axes: [], options: [] });
  });

  it('ảnh mà chưa nhận ra sản phẩm → hỏi mẫu nào nhưng cần người, không tự gửi (FR-143 + FR-147)', () => {
    const d = decideAction(
      base({
        extract: { ...base().extract, refers_to_image: true },
        products: { candidates: [], missingAxes: [] },
      }),
    );
    expect(d).toMatchObject({
      action: 'clarify',
      reason: 'image_product',
      needsHuman: true,
      autoSendPolicy: 'never',
    });
    expect(d.clarify?.ask).toBe('product');
  });

  it('ảnh nhưng đã nhận ra đúng một sản phẩm → không coi là thiếu', () => {
    const d = decideAction(base({ extract: { ...base().extract, refers_to_image: true } }));
    expect(d.action).toBe('answer');
  });

  it('mỗi lượt chỉ MỘT câu hỏi: thiếu cả mẫu lẫn số đo → chỉ hỏi mẫu', () => {
    const d = decideAction(
      base({
        products: { candidates: ['Áo A', 'Áo B'], missingAxes: ['size'] },
        topics: [{ topic: 'size', sourced: true }],
      }),
    );
    expect(d.clarify?.ask).toBe('product');
  });

  it('thiếu thông tin cả hai phía: hỏi khách trước (bậc 2 trước bậc 3)', () => {
    const d = decideAction(
      base({
        products: { candidates: ['Áo A'], missingAxes: ['size'] },
        topics: [{ topic: 'shipping', sourced: false }],
      }),
    );
    expect(d.action).toBe('clarify');
  });

  it(`đã hỏi lại ${MAX_CLARIFY_PER_THREAD} lần trong chuỗi mà vẫn cần hỏi → chuyển người (clarify_limit)`, () => {
    const needClarify = base({ products: { candidates: ['Áo A'], missingAxes: ['size'] } });
    expect(
      decideAction({
        ...needClarify,
        thread: { clarifyCount: MAX_CLARIFY_PER_THREAD - 1, repeatCount: 0 },
      }).action,
    ).toBe('clarify');
    const d = decideAction({
      ...needClarify,
      thread: { clarifyCount: MAX_CLARIFY_PER_THREAD, repeatCount: 0 },
    });
    expect(d).toMatchObject({
      action: 'handoff',
      reason: 'clarify_limit',
      needsHuman: true,
      clarify: null,
      autoSendPolicy: 'never',
    });
  });

  it('đã hỏi đủ số lần nhưng KHÔNG còn cần hỏi → vẫn trả lời bình thường', () => {
    const d = decideAction(
      base({ thread: { clarifyCount: MAX_CLARIFY_PER_THREAD, repeatCount: 0 } }),
    );
    expect(d.action).toBe('answer');
  });
});

describe('FR-141 decideAction — bậc 3: chuyển hướng, trả lời một phần, không tự tính', () => {
  it('giá có nguồn, phí ship không → redirect: trả lời phần giá, mời ib về ship, tag Cần hỗ trợ thêm', () => {
    const d = decideAction(
      base({
        topics: [
          { topic: 'product_info', sourced: true },
          { topic: 'shipping', sourced: false },
        ],
      }),
    );
    expect(d).toMatchObject({
      action: 'redirect',
      reason: 'topic_unsourced',
      needsHuman: false,
      needsSupportTag: true,
      answeredTopics: ['product_info'],
      unansweredTopics: ['shipping'],
      redirectTemplates: ['shipping'],
      autoSendPolicy: 'allow_partial',
    });
  });

  it('không có ý nào trả lời được → redirect chỉ câu mời (không ý fact) → xét allow_clarify', () => {
    const d = decideAction(base({ topics: [{ topic: 'discount', sourced: false }] }));
    expect(d.action).toBe('redirect');
    expect(d.answeredTopics).toEqual([]);
    expect(d.redirectTemplates).toEqual(['discount']);
    expect(d.autoSendPolicy).toBe('allow_clarify');
  });

  it('khóa mẫu câu mời theo chủ đề: order_status giữ nguyên, policy/product_info/size/other → other', () => {
    const d = decideAction(
      base({
        topics: [
          { topic: 'order_status', sourced: false },
          { topic: 'policy', sourced: false },
          { topic: 'size', sourced: false },
          { topic: 'other', sourced: false },
        ],
      }),
    );
    expect(d.redirectTemplates).toEqual(['order_status', 'other']);
  });

  it('cùng chủ đề vừa có nguồn vừa không → tính là chưa có nguồn (thiên về chặn), không trùng', () => {
    const d = decideAction(
      base({
        topics: [
          { topic: 'shipping', sourced: true },
          { topic: 'shipping', sourced: false },
          { topic: 'product_info', sourced: true },
          { topic: 'product_info', sourced: true },
        ],
      }),
    );
    expect(d.answeredTopics).toEqual(['product_info']);
    expect(d.unansweredTopics).toEqual(['shipping']);
  });

  it('hỏi đơn hàng (FR-153) → chuyển hướng ib + cần người, không tự gửi, dù có "nguồn" hay đang cần hỏi lại', () => {
    const sourced = decideAction(
      base({
        topics: [
          { topic: 'product_info', sourced: true },
          { topic: 'order_status', sourced: true },
        ],
        products: { candidates: ['A', 'B'], missingAxes: [] },
      }),
    );
    expect(sourced).toMatchObject({
      action: 'redirect',
      reason: 'order_status',
      needsHuman: true,
      needsSupportTag: true,
      clarify: null,
      answeredTopics: ['product_info'],
      unansweredTopics: ['order_status'],
      redirectTemplates: ['order_status'],
      autoSendPolicy: 'never',
    });
    const unsourced = decideAction(base({ topics: [{ topic: 'order_status', sourced: false }] }));
    expect(unsourced.action).toBe('redirect');
    expect(unsourced.needsHuman).toBe(true);
  });

  it('effectiveAutoSendPolicy: allow_clarify chỉ khi bản nháp không có ý fact; có fact → allow_partial', () => {
    const fact = { claims: [{ kind: 'fact' }, { kind: 'handoff' }] };
    const noFact = { claims: [{ kind: 'question_back' }] };
    expect(effectiveAutoSendPolicy('allow_clarify', fact)).toBe('allow_partial');
    expect(effectiveAutoSendPolicy('allow_clarify', noFact)).toBe('allow_clarify');
    expect(effectiveAutoSendPolicy('never', fact)).toBe('never');
    expect(effectiveAutoSendPolicy('standard', fact)).toBe('standard');
    expect(effectiveAutoSendPolicy('allow_partial', noFact)).toBe('allow_partial');
  });

  it('tồn kho cũ (FR-151) → redirect mẫu stock_check dù mọi ý có nguồn', () => {
    const d = decideAction(base({ risks: { ...NO_RISK, stockStale: true } }));
    expect(d.action).toBe('redirect');
    expect(d.reason).toBe('stock_stale');
    expect(d.redirectTemplates).toEqual(['stock_check']);
    expect(d.needsSupportTag).toBe(true);
  });

  it('danh sách chủ đề trả về theo thứ tự cố định, không phụ thuộc thứ tự đầu vào', () => {
    const a = decideAction(
      base({
        topics: [
          { topic: 'other', sourced: false },
          { topic: 'shipping', sourced: false },
        ],
      }),
    );
    const b = decideAction(
      base({
        topics: [
          { topic: 'shipping', sourced: false },
          { topic: 'other', sourced: false },
        ],
      }),
    );
    expect(a.unansweredTopics).toEqual(['shipping', 'other']);
    expect(b).toEqual(a);
  });
});

describe('FR-147 decideAction — bậc 4: chuyển người khi có rủi ro (luôn thắng)', () => {
  const risky: Array<[string, Partial<DecideActionInput>, string]> = [
    ['ngôn ngữ ngoài vi/en (FR-159)', { lang: 'other' }, 'lang_other'],
    [
      'khiếu nại ở nhãn phụ (FR-145)',
      {
        extract: {
          ...base().extract,
          labels: [{ label: 'price' }, { label: 'complaint' }],
        },
      },
      'complaint',
    ],
    ['mạo danh (FR-155)', { risks: { ...NO_RISK, impersonation: true } }, 'impersonation'],
    ['xung đột giá (FR-150)', { risks: { ...NO_RISK, priceConflict: true } }, 'price_conflict'],
    [
      'cam kết pháp lý không nguồn (FR-160)',
      { risks: { ...NO_RISK, legalUnsourced: true } },
      'legal_unsourced',
    ],
    [
      `khách hỏi lại cùng ý ≥ ${REPEAT_HANDOFF_THRESHOLD} lần (FR-144)`,
      { thread: { clarifyCount: 0, repeatCount: REPEAT_HANDOFF_THRESHOLD } },
      'repeat_limit',
    ],
  ];

  for (const [name, over, reason] of risky) {
    it(`${name} → handoff, cần người, không tự gửi`, () => {
      const d = decideAction(base(over));
      expect(d).toMatchObject({
        action: 'handoff',
        reason,
        needsHuman: true,
        needsSupportTag: false,
        clarify: null,
        autoSendPolicy: 'never',
      });
    });
  }

  it('rủi ro thắng cả khi đồng thời thiếu thông tin khách và thiếu nguồn', () => {
    const d = decideAction(
      base({
        risks: { ...NO_RISK, priceConflict: true },
        products: { candidates: ['A', 'B'], missingAxes: ['size'] },
        topics: [{ topic: 'shipping', sourced: false }],
      }),
    );
    expect(d.action).toBe('handoff');
    expect(d.reason).toBe('price_conflict');
  });

  it('hỏi lại dưới ngưỡng không chuyển người', () => {
    const d = decideAction(
      base({ thread: { clarifyCount: 0, repeatCount: REPEAT_HANDOFF_THRESHOLD - 1 } }),
    );
    expect(d.action).toBe('answer');
  });
});

describe('FR-147 FR-032 decideAction — đầu vào không đọc được → chuyển người, không ném', () => {
  /** Đầu vào cố ý sai kiểu (test); kiểu `unknown` vì `decideAction` nhận dữ liệu bất kỳ. */
  const broken = (over: Record<string, unknown>): unknown => ({ ...base(), ...over });
  it.each<[string, unknown]>([
    ['không phải object', 'xin chào'],
    ['null', null],
    ['thiếu extract', { lang: 'vi' }],
    ['nhãn lạ', broken({ extract: { ...base().extract, labels: [{ label: 'vip' }] } })],
    ['không có nhãn', broken({ extract: { ...base().extract, labels: [] } })],
    ['đếm âm', broken({ thread: { clarifyCount: -1, repeatCount: 0 } })],
    ['chủ đề lạ', broken({ topics: [{ topic: 'vat', sourced: true }] })],
    ['ngôn ngữ lạ', broken({ lang: 'fr' })],
    ['thiếu cờ rủi ro (không "mở khi lỗi")', broken({ risks: { priceConflict: false } })],
    ['thiếu hẳn risks', broken({ risks: undefined })],
  ])('%s → handoff input_unreadable', (_name, raw) => {
    expect(readDecideActionInput(raw)).toBeNull();
    const d = decideAction(raw);
    expect(d).toMatchObject({
      action: 'handoff',
      reason: 'input_unreadable',
      needsHuman: true,
      autoSendPolicy: 'never',
      clarify: null,
      answeredTopics: [],
      unansweredTopics: [],
    });
  });

  it('trường lạ do AI thêm (ví dụ action, needs_human tự chấm) bị bỏ, không đổi quyết định', () => {
    const raw = {
      ...base(),
      action: 'answer',
      needs_human: false,
      risks: { ...NO_RISK, priceConflict: true },
    };
    expect(decideAction(raw).action).toBe('handoff');
    const raw2 = {
      ...base({ products: { candidates: ['A', 'B'], missingAxes: [] } }),
      action: 'answer',
      confidence: 0.99,
    };
    expect(decideAction(raw2).action).toBe('clarify');
  });

  it('nhận trực tiếp ExtractResult đầy đủ (trường thừa như asks/qty không gây lỗi)', () => {
    const d = decideAction(
      base({
        extract: {
          ...base().extract,
          asks: ['giá'],
          qty: 2,
          cited_price_vnd: null,
          product_mentions: ['áo'],
          order_intent: null,
        },
      }),
    );
    expect(d.action).toBe('answer');
  });
});

describe('FR-147 FR-141 decideAction — property-based', () => {
  const SEED = 20261106;
  const labelArb = fc.record({
    label: fc.constantFrom(...COMMENT_LABELS),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  });
  const extractArb = fc.record({
    labels: fc.array(labelArb, { minLength: 1, maxLength: 4 }),
    refers_to_image: fc.boolean(),
    size: fc.option(fc.constantFrom('S', 'M', 'L'), { nil: null }),
    color: fc.option(fc.constantFrom('đen', 'trắng'), { nil: null }),
    height_cm: fc.option(fc.integer({ min: 100, max: 200 }), { nil: null }),
    weight_kg: fc.option(fc.integer({ min: 30, max: 120 }), { nil: null }),
  });
  const productsArb = fc.record({
    candidates: fc.array(fc.constantFrom('Áo A', 'Áo B', 'Quần C', 'Váy D'), { maxLength: 4 }),
    missingAxes: fc.uniqueArray(fc.constantFrom('size' as const, 'color' as const), {
      maxLength: 2,
    }),
  });
  const topicsArb = fc.array(
    fc.record({ topic: fc.constantFrom(...KB_GAP_TOPICS), sourced: fc.boolean() }),
    { maxLength: 5 },
  );
  const threadArb = fc.record({
    clarifyCount: fc.integer({ min: 0, max: 4 }),
    repeatCount: fc.integer({ min: 0, max: 4 }),
  });
  const risksArb = fc.record({
    priceConflict: fc.boolean(),
    legalUnsourced: fc.boolean(),
    impersonation: fc.boolean(),
    stockStale: fc.boolean(),
    injectionSuspected: fc.boolean(),
  });
  const inputArb: fc.Arbitrary<DecideActionInput> = fc.record({
    lang: fc.constantFrom('vi' as const, 'en' as const, 'other' as const),
    extract: extractArb,
    products: productsArb,
    topics: topicsArb,
    thread: threadArb,
    risks: risksArb,
  });

  const hasRisk = (i: DecideActionInput) =>
    i.lang === 'other' ||
    i.extract.labels.some((l) => l.label === 'complaint') ||
    Boolean(i.risks.priceConflict || i.risks.legalUnsourced || i.risks.impersonation) ||
    i.thread.repeatCount >= REPEAT_HANDOFF_THRESHOLD;

  it('hành động luôn thuộc 4 loại, xác định, không ném; handoff ⇒ cần người và không tự gửi', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const a = decideAction(input);
        const b = decideAction(structuredClone(input));
        expect(ACTION_KINDS).toContain(a.action);
        expect(b).toEqual(a);
        if (a.action === 'handoff') {
          expect(a.needsHuman).toBe(true);
          expect(a.autoSendPolicy).toBe('never');
          expect(a.clarify).toBeNull();
        }
        expect(a.clarify !== null).toBe(a.action === 'clarify');
        expect(a.needsSupportTag).toBe(a.action === 'redirect');
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('có rủi ro ⇒ luôn handoff; answer ⇔ mọi ý có nguồn, không tồn kho cũ, không cần hỏi', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const d = decideAction(input);
        if (hasRisk(input)) expect(d.action).toBe('handoff');
        if (d.action === 'answer') {
          expect(input.topics.every((t) => t.sourced)).toBe(true);
          expect(input.risks.stockStale).toBe(false);
          expect(hasRisk(input)).toBe(false);
          expect(input.topics.some((t) => t.topic === 'order_status')).toBe(false);
        }
        // Hỏi đơn hàng luôn tính là chưa trả lời được (FR-153), còn lại đúng theo `sourced`.
        const unsourced = new Set(
          input.topics.filter((t) => !t.sourced || t.topic === 'order_status').map((t) => t.topic),
        );
        for (const topic of d.unansweredTopics) expect(unsourced.has(topic)).toBe(true);
        for (const topic of d.answeredTopics) expect(unsourced.has(topic)).toBe(false);
        if (input.topics.some((t) => t.topic === 'order_status') && !hasRisk(input)) {
          expect(d.needsHuman).toBe(true);
          expect(d.autoSendPolicy).toBe('never');
        }
      }),
      { seed: SEED, numRuns: 400 },
    );
  });

  it('đổi thứ tự nhãn/chủ đề/ứng viên không đổi hành động và lý do (chỉ thứ tự gợi ý có thể đổi)', () => {
    fc.assert(
      fc.property(inputArb, fc.integer(), (input, salt) => {
        const shuffle = <T>(xs: T[]) =>
          [...xs].sort((x, y) => (JSON.stringify(x) + salt < JSON.stringify(y) + salt ? -1 : 1));
        const permuted: DecideActionInput = {
          ...input,
          extract: { ...input.extract, labels: shuffle(input.extract.labels) },
          products: {
            candidates: shuffle(input.products.candidates),
            missingAxes: shuffle(input.products.missingAxes),
          },
          topics: shuffle(input.topics),
        };
        const a = decideAction(input);
        const b = decideAction(permuted);
        expect(b.action).toBe(a.action);
        expect(b.reason).toBe(a.reason);
        expect(b.unansweredTopics).toEqual(a.unansweredTopics);
        expect(b.autoSendPolicy).toBe(a.autoSendPolicy);
        expect(b.clarify?.ask).toBe(a.clarify?.ask);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('đơn điệu theo số lần hỏi: tăng clarifyCount/repeatCount không bao giờ đổi handoff thành hành động khác', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: 3 }), (input, extra) => {
        const a = decideAction(input);
        const more = decideAction({
          ...input,
          thread: {
            clarifyCount: input.thread.clarifyCount + extra,
            repeatCount: input.thread.repeatCount + extra,
          },
        });
        if (a.action === 'handoff') expect(more.action).toBe('handoff');
        if (a.askedBefore) expect(more.askedBefore).toBe(true);
      }),
      { seed: SEED, numRuns: 300 },
    );
  });

  it('dữ liệu tùy ý không ném; không đúng dạng → handoff input_unreadable', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const d = decideAction(raw);
        expect(ACTION_KINDS).toContain(d.action);
        if (readDecideActionInput(raw) === null) expect(d.reason).toBe('input_unreadable');
      }),
      { seed: SEED, numRuns: 300 },
    );
  });
});

describe('DA-RULES-WIRE — ca hành động đo được bằng EVAL-RUNNER', () => {
  it('hỏi giá/tồn mà chưa nhận ra sản phẩm nào và chưa có nguồn → hỏi lại sản phẩm (không chuyển hướng)', () => {
    for (const topic of ['product_info', 'size'] as const) {
      const d = decideAction(
        base({
          products: { candidates: [], missingAxes: [] },
          topics: [{ topic, sourced: false }],
        }),
      );
      expect(d).toMatchObject({ action: 'clarify', reason: 'product_unknown', needsHuman: false });
      expect(d.clarify).toEqual({ ask: 'product', axes: [], options: [] });
    }
  });

  it('khách đã nêu size cụ thể → không hỏi số đo cơ thể dù có ý "size" và bảng size', () => {
    const d = decideAction(
      base({
        extract: { ...base().extract, size: 'M' },
        topics: [
          { topic: 'product_info', sourced: true },
          { topic: 'size', sourced: true },
        ],
      }),
    );
    expect(d.action).toBe('answer');
  });

  it('khách ĐÃ nêu tên sản phẩm nhưng shop không có → chuyển hướng (hỏi "mẫu nào" là vô nghĩa)', () => {
    const d = decideAction(
      base({
        products: { candidates: [], missingAxes: [], mentionedCount: 1 },
        topics: [{ topic: 'product_info', sourced: false }],
      }),
    );
    expect(d).toMatchObject({ action: 'redirect', reason: 'topic_unsourced' });
  });

  it('chưa nhận ra sản phẩm nhưng câu hỏi chung ĐÃ có nguồn (bảng size) → vẫn trả lời, không hỏi sản phẩm', () => {
    const d = decideAction(
      base({
        products: { candidates: [], missingAxes: [] },
        topics: [{ topic: 'size', sourced: true }],
        extract: { ...base().extract, height_cm: 170, weight_kg: 60 },
      }),
    );
    expect(d.action).toBe('answer');
  });

  it('chưa nhận ra sản phẩm, chủ đề khác (ship) chưa nguồn → vẫn chuyển hướng như cũ', () => {
    const d = decideAction(
      base({
        products: { candidates: [], missingAxes: [] },
        topics: [{ topic: 'shipping', sourced: false }],
      }),
    );
    expect(d).toMatchObject({ action: 'redirect', reason: 'topic_unsourced' });
  });

  it('nghi chèn lệnh (injection) → chuyển người, không tự gửi, thắng cả khi mọi thứ khác ổn', () => {
    const d = decideAction(base({ risks: { ...NO_RISK, injectionSuspected: true } }));
    expect(d).toMatchObject({
      action: 'handoff',
      reason: 'injection_suspected',
      needsHuman: true,
      autoSendPolicy: 'never',
    });
  });

  it('thiếu cờ injectionSuspected → không đọc được đầu vào → chuyển người (không mở khi lỗi)', () => {
    const { injectionSuspected: _drop, ...partial } = NO_RISK;
    expect(decideAction(base({ risks: partial as never })).reason).toBe('input_unreadable');
  });
});
