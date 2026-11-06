import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ACTION_KINDS,
  CONFIDENCE_WEIGHTS_VERSION,
  type ConfidenceSignals,
  computeConfidence,
  DEFAULT_CONFIDENCE_WEIGHTS,
  REASON_HANDOFF_ACTION,
  REASON_UNREADABLE,
  readConfidenceSignals,
  sigmoid,
} from './confidence';

/** Bộ tín hiệu "tốt" dùng làm mốc: z = −10 + 4.5 + 1.5 + 3.2 + 0.6 + 3.5 + 1 = 4.3. */
const good: ConfidenceSignals = {
  pLabel: 0.9,
  sProduct: 1,
  sRetrievalTop1: 0.8,
  sRetrievalTop2: 0.5,
  factSourcedRatio: 1,
  action: 'answer',
  askedBefore: false,
};

describe('FR-163 sigmoid', () => {
  it('0 → 0.5; đối xứng; tiến về 0 và 1 ở hai đầu', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1, 12);
    expect(sigmoid(50)).toBeLessThanOrEqual(1);
    expect(sigmoid(-50)).toBeGreaterThanOrEqual(0);
    expect(sigmoid(Number.POSITIVE_INFINITY)).toBe(1);
    expect(sigmoid(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('FR-163 computeConfidence — công thức §6.0 với trọng số mặc định', () => {
  it('ca tốt tính tay: z = 4.3 → ≈ 0.9866, không cần người', () => {
    const result = computeConfidence(good);
    expect(result.components?.z).toBeCloseTo(4.3, 9);
    expect(result.confidence).toBeCloseTo(0.98661, 4);
    expect(result.needsHuman).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('components ghi từng thành phần, số hạng, trọng số và phiên bản', () => {
    const { components } = computeConfidence(good);
    expect(components).toMatchObject({
      weights_version: CONFIDENCE_WEIGHTS_VERSION,
      p_label: 0.9,
      s_product: 1,
      s_retrieval_top1: 0.8,
      fact_sourced_ratio: 1,
      action: 'answer',
      action_answer: 1,
      asked_before: 0,
    });
    expect(components?.s_retrieval_margin).toBeCloseTo(0.3, 9);
    expect(components?.terms).toMatchObject({ bias: -10, p_label: 4.5, asked_before: 0 });
    expect(components?.terms.s_retrieval_margin).toBeCloseTo(0.6, 9);
    expect(components?.weights).toEqual(DEFAULT_CONFIDENCE_WEIGHTS);
  });

  it('đã hỏi lại trước đó → trừ w7: z = 3.3 → ≈ 0.9644', () => {
    const result = computeConfidence({ ...good, askedBefore: true });
    expect(result.components?.z).toBeCloseTo(3.3, 9);
    expect(result.confidence).toBeCloseTo(0.96443, 4);
  });

  it('hành động clarify/redirect không được cộng w6', () => {
    expect(computeConfidence({ ...good, action: 'clarify' }).components?.z).toBeCloseTo(3.3, 9);
    expect(computeConfidence({ ...good, action: 'redirect' }).components?.action_answer).toBe(0);
  });

  it('handoff → điểm vẫn tính nhưng luôn cần người (§6 mục 6)', () => {
    const result = computeConfidence({ ...good, action: 'handoff' });
    expect(result.needsHuman).toBe(true);
    expect(result.reason).toBe(REASON_HANDOFF_ACTION);
    expect(result.components?.action_answer).toBe(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('tín hiệu thiếu (null) tính 0 — thiên về chặn', () => {
    const result = computeConfidence({
      pLabel: null,
      sProduct: null,
      sRetrievalTop1: null,
      sRetrievalTop2: null,
      factSourcedRatio: null,
      action: 'answer',
      askedBefore: false,
    });
    expect(result.components?.z).toBe(-9);
    expect(result.confidence).toBeLessThan(0.001);
    expect(result.needsHuman).toBe(false);
  });

  it('top2 > top1 → khoảng cách 0, không âm', () => {
    const result = computeConfidence({ ...good, sRetrievalTop1: 0.4, sRetrievalTop2: 0.9 });
    expect(result.components?.s_retrieval_margin).toBe(0);
  });

  it('thiếu top1 hoặc thiếu top2 → khoảng cách 0 (thiếu tín hiệu không được cộng điểm)', () => {
    const noTop1 = computeConfidence({ ...good, sRetrievalTop1: null, sRetrievalTop2: 0.9 });
    expect(noTop1.components?.s_retrieval_top1).toBe(0);
    expect(noTop1.components?.s_retrieval_margin).toBe(0);
    const noTop2 = computeConfidence({ ...good, sRetrievalTop2: null });
    expect(noTop2.components?.s_retrieval_margin).toBe(0);
    expect(noTop2.confidence).toBeLessThanOrEqual(computeConfidence(good).confidence);
  });

  it.each([
    ['bias NaN', { bias: Number.NaN }],
    ['pLabel vô cực', { pLabel: Number.POSITIVE_INFINITY }],
    ['askedBefore âm (biến trừ thành cộng)', { askedBefore: -1 }],
    ['factSourcedRatio âm', { factSourcedRatio: -2 }],
    ['version rỗng', { version: '' }],
  ])('trọng số hỏng (%s) → không tính được → 0, cần người', (_name, patch) => {
    const result = computeConfidence(good, { ...DEFAULT_CONFIDENCE_WEIGHTS, ...patch });
    expect(result).toEqual({
      confidence: 0,
      needsHuman: true,
      reason: REASON_UNREADABLE,
      components: null,
    });
  });

  it('trọng số truyền vào ghi đè mặc định (hiệu chuẩn sau)', () => {
    const weights = { ...DEFAULT_CONFIDENCE_WEIGHTS, bias: 0, version: 'test@1' };
    const result = computeConfidence(good, weights);
    expect(result.components?.z).toBeCloseTo(14.3, 9);
    expect(result.components?.weights_version).toBe('test@1');
  });

  it('số model tự chấm (self_score, confidence, score) bị bỏ qua, không đổi điểm', () => {
    const tainted = { ...good, self_score: 0.99, confidence: 1, score: 1, modelConfidence: 1 };
    expect(computeConfidence(tainted)).toEqual(computeConfidence(good));
  });
});

describe('FR-032 kết quả không đọc được → 0 và chuyển người', () => {
  const zero = { confidence: 0, needsHuman: true, reason: REASON_UNREADABLE, components: null };

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['chuỗi', '{"pLabel":0.9}'],
    ['số', 0.9],
    ['mảng', [good]],
    ['object rỗng', {}],
  ])('đầu vào %s → 0', (_name, raw) => {
    expect(computeConfidence(raw)).toEqual(zero);
    expect(readConfidenceSignals(raw)).toBeNull();
  });

  it.each([
    ['pLabel NaN', { ...good, pLabel: Number.NaN }],
    ['pLabel > 1', { ...good, pLabel: 1.0001 }],
    ['sProduct < 0', { ...good, sProduct: -0.0001 }],
    ['sRetrievalTop1 vô cực', { ...good, sRetrievalTop1: Number.POSITIVE_INFINITY }],
    ['factSourcedRatio là chuỗi', { ...good, factSourcedRatio: '1' }],
    ['askedBefore là chuỗi', { ...good, askedBefore: 'no' }],
    ['thiếu action', { ...good, action: undefined }],
  ])('%s → 0', (_name, raw) => {
    expect(computeConfidence(raw)).toEqual(zero);
  });

  it.each(['reply', 'ANSWER', 'answer ', 'escalate', '', 42, null])(
    'loại hành động lạ %j → bỏ, coi như không đọc được → 0',
    (action) => {
      expect(computeConfidence({ ...good, action })).toEqual(zero);
    },
  );

  it('không ném với bất kỳ đầu vào nào', () => {
    expect(() => computeConfidence(Symbol('x'))).not.toThrow();
    expect(() => computeConfidence(() => good)).not.toThrow();
  });
});

describe('FR-163 FR-032 property-based', () => {
  const unit = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
  const maybeUnit = fc.option(unit, { nil: null });
  const signals = fc.record<ConfidenceSignals>({
    pLabel: maybeUnit,
    sProduct: maybeUnit,
    sRetrievalTop1: maybeUnit,
    sRetrievalTop2: maybeUnit,
    factSourcedRatio: maybeUnit,
    action: fc.constantFrom(...ACTION_KINDS),
    askedBefore: fc.boolean(),
  });
  const numericKeys = [
    'pLabel',
    'sProduct',
    'sRetrievalTop1',
    'factSourcedRatio',
  ] as const satisfies readonly (keyof ConfidenceSignals)[];

  it('mọi tín hiệu hợp lệ → điểm trong [0,1], xác định, tổng số hạng = z', () => {
    fc.assert(
      fc.property(signals, (s) => {
        const a = computeConfidence(s);
        const b = computeConfidence(s);
        expect(a).toEqual(b);
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(1);
        expect(a.components).not.toBeNull();
        const terms = a.components?.terms;
        if (!terms) throw new Error('terms');
        const sum = Object.values(terms).reduce((acc, value) => acc + value, 0);
        expect(sum).toBeCloseTo(a.components?.z ?? Number.NaN, 9);
        expect(Number.isFinite(a.components?.z)).toBe(true);
        expect(a.needsHuman).toBe(s.action === 'handoff');
      }),
      { seed: 20261106, numRuns: 400 },
    );
  });

  it('đơn điệu: tăng một tín hiệu dương không làm điểm giảm; đã hỏi lại không làm điểm tăng', () => {
    fc.assert(
      fc.property(signals, fc.constantFrom(...numericKeys), unit, (s, key, bump) => {
        const base = computeConfidence(s).confidence;
        const current = s[key] ?? 0;
        const higher = Math.min(1, current + bump);
        expect(computeConfidence({ ...s, [key]: higher }).confidence).toBeGreaterThanOrEqual(base);
        expect(computeConfidence({ ...s, askedBefore: true }).confidence).toBeLessThanOrEqual(
          computeConfidence({ ...s, askedBefore: false }).confidence,
        );
        expect(computeConfidence({ ...s, action: 'answer' }).confidence).toBeGreaterThanOrEqual(
          computeConfidence({ ...s, action: 'clarify' }).confidence,
        );
      }),
      { seed: 20261106, numRuns: 400 },
    );
  });

  it('khoảng cách top1 − top2: top2 lớn hơn hoặc thiếu top2 không bao giờ làm điểm tăng', () => {
    fc.assert(
      fc.property(signals, unit, unit, (s, a, b) => {
        const low = Math.min(a, b);
        const high = Math.max(a, b);
        const withLow = computeConfidence({ ...s, sRetrievalTop2: low }).confidence;
        expect(computeConfidence({ ...s, sRetrievalTop2: high }).confidence).toBeLessThanOrEqual(
          withLow,
        );
        expect(computeConfidence({ ...s, sRetrievalTop2: null }).confidence).toBeLessThanOrEqual(
          withLow,
        );
      }),
      { seed: 20261106, numRuns: 300 },
    );
  });

  it('JSON tùy ý (không đúng dạng tín hiệu) → luôn 0 và cần người', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const result = computeConfidence(raw);
        if (result.components === null) {
          expect(result.confidence).toBe(0);
          expect(result.needsHuman).toBe(true);
          expect(result.reason).toBe(REASON_UNREADABLE);
        } else {
          // Hiếm khi JSON ngẫu nhiên tình cờ đúng dạng: khi đó phải là object có action hợp lệ.
          expect(ACTION_KINDS).toContain((raw as { action: string }).action);
        }
      }),
      { seed: 20261106, numRuns: 300 },
    );
  });

  it('số ngoài [0,1] hoặc không hữu hạn ở bất kỳ tín hiệu nào → 0', () => {
    const bad = fc.oneof(
      fc.double({ min: 1.000001, max: 1e9, noNaN: true }),
      fc.double({ min: -1e9, max: -0.000001, noNaN: true }),
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
    );
    fc.assert(
      fc.property(signals, fc.constantFrom(...numericKeys, 'sRetrievalTop2'), bad, (s, key, v) => {
        expect(computeConfidence({ ...s, [key]: v }).confidence).toBe(0);
      }),
      { seed: 20261106, numRuns: 300 },
    );
  });
});
