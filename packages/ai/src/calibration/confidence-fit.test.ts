import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeConfidence,
  confidenceWeightsSchema,
  DEFAULT_CONFIDENCE_WEIGHTS,
} from '../confidence';
import {
  type ConfidenceFitSample,
  expectedCalibrationError,
  fitConfidenceWeights,
  logLoss,
  reliabilityCurve,
  signalFeatures,
} from './confidence-fit';

type Sig = {
  pLabel: number | null;
  sProduct: number | null;
  sRetrievalTop1: number | null;
  sRetrievalTop2: number | null;
  factSourcedRatio: number | null;
  action: 'answer' | 'clarify' | 'redirect' | 'handoff';
  askedBefore: boolean;
};

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const nullableUnit = fc.option(unit, { nil: null });
const signals: fc.Arbitrary<Sig> = fc.record({
  pLabel: nullableUnit,
  sProduct: nullableUnit,
  sRetrievalTop1: nullableUnit,
  sRetrievalTop2: nullableUnit,
  factSourcedRatio: nullableUnit,
  action: fc.constantFrom('answer', 'clarify', 'redirect', 'handoff'),
  askedBefore: fc.boolean(),
});

/** Fixture tổng hợp (không phải dữ liệu thật): xác suất đúng tăng theo `factSourcedRatio` và `pLabel`. */
function makeSamples(n: number, seed = 1): ConfidenceFitSample[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Array.from({ length: n }, () => {
    const pLabel = rnd();
    const fact = rnd();
    const top1 = rnd();
    const pCorrect = 0.1 + 0.8 * (0.5 * pLabel + 0.5 * fact);
    return {
      signals: {
        pLabel,
        sProduct: rnd(),
        sRetrievalTop1: top1,
        sRetrievalTop2: top1 * rnd(),
        factSourcedRatio: fact,
        action: 'answer' as const,
        askedBefore: rnd() < 0.2,
      },
      correct: rnd() < pCorrect,
    };
  });
}

describe('FR-163 signalFeatures khớp công thức §6.0 của computeConfidence', () => {
  it('z từ véc-tơ đặc trưng = z của computeConfidence (mọi tín hiệu hợp lệ)', () => {
    fc.assert(
      fc.property(signals, (sig) => {
        const f = signalFeatures(sig);
        expect(f).not.toBeNull();
        const w = DEFAULT_CONFIDENCE_WEIGHTS;
        const z =
          w.bias +
          w.pLabel * (f?.pLabel ?? 0) +
          w.sProduct * (f?.sProduct ?? 0) +
          w.sRetrievalTop1 * (f?.sRetrievalTop1 ?? 0) +
          w.retrievalMargin * (f?.retrievalMargin ?? 0) +
          w.factSourcedRatio * (f?.factSourcedRatio ?? 0) +
          w.actionAnswer * (f?.actionAnswer ?? 0) -
          w.askedBefore * (f?.askedBefore ?? 0);
        expect(z).toBeCloseTo(computeConfidence(sig).components?.z ?? Number.NaN, 9);
      }),
    );
  });

  it('tín hiệu hỏng → null', () => {
    expect(signalFeatures({ action: 'weird' })).toBeNull();
    expect(signalFeatures(null)).toBeNull();
  });
});

describe('FR-163 fitConfidenceWeights — chưa đủ dữ liệu', () => {
  it('< 50 mẫu hợp lệ → giữ trọng số mặc định', () => {
    const r = fitConfidenceWeights(makeSamples(49));
    expect(r.status).toBe('insufficient_data');
    expect(r.weights).toEqual(DEFAULT_CONFIDENCE_WEIGHTS);
  });

  it('một lớp quá ít (< 10 mẫu sai) → giữ mặc định', () => {
    const base = makeSamples(100).map((s) => ({ ...s, correct: true }));
    base[0] = { ...(base[0] as ConfidenceFitSample), correct: false };
    const r = fitConfidenceWeights(base);
    expect(r.status).toBe('insufficient_data');
    expect(r.weights).toEqual(DEFAULT_CONFIDENCE_WEIGHTS);
  });

  it('mẫu hỏng bị bỏ và đếm', () => {
    const r = fitConfidenceWeights([
      ...makeSamples(10),
      { signals: { action: 'weird' }, correct: true },
    ]);
    expect(r.ignoredCount).toBe(1);
    expect(r.sampleCount).toBe(10);
  });
});

describe('FR-163 fitConfidenceWeights — đủ dữ liệu', () => {
  const samples = makeSamples(400);

  it('trọng số mới hợp lệ, log-loss không tệ hơn mặc định, có version riêng', () => {
    const r = fitConfidenceWeights(samples);
    expect(r.status).toBe('ready');
    expect(confidenceWeightsSchema.safeParse(r.weights).success).toBe(true);
    expect(r.weights.version).toBe('calibrated@400');
    expect(r.logLossAfter).toBeLessThanOrEqual(r.logLossBefore);
    expect(r.logLossAfter).toBeLessThan(r.logLossBefore);
  });

  it('xác định: cùng đầu vào → cùng kết quả', () => {
    expect(fitConfidenceWeights(samples)).toEqual(fitConfidenceWeights(samples));
  });

  it('đã hiệu chuẩn thì ECE không tệ hơn mặc định (đường hiệu chuẩn lệch nhỏ)', () => {
    const r = fitConfidenceWeights(samples);
    expect(r.eceAfter).toBeLessThanOrEqual(r.eceBefore + 1e-9);
    expect(r.eceAfter).toBeLessThanOrEqual(0.1);
  });

  it('không tự áp dụng: trọng số mặc định không bị đổi', () => {
    const before = JSON.stringify(DEFAULT_CONFIDENCE_WEIGHTS);
    fitConfidenceWeights(samples);
    expect(JSON.stringify(DEFAULT_CONFIDENCE_WEIGHTS)).toBe(before);
    expect(Object.isFrozen(DEFAULT_CONFIDENCE_WEIGHTS)).toBe(true);
  });
});

describe('FR-163 an toàn: thiếu tín hiệu vẫn thiên về chặn (verifier)', () => {
  const empty = {
    pLabel: null,
    sProduct: null,
    sRetrievalTop1: null,
    sRetrievalTop2: null,
    factSourcedRatio: null,
    action: 'answer',
    askedBefore: false,
  };

  it('dữ liệu gần như toàn "đúng" không đẩy bias lên làm bản nháp trống qua sàn 0,80', () => {
    const skewed = makeSamples(300).map((s, i) => ({ ...s, correct: i % 25 !== 0 }));
    const r = fitConfidenceWeights(skewed);
    expect(computeConfidence(empty, r.weights).confidence).toBeLessThan(0.8);
  });

  it('prior hỏng (NaN/âm) → dùng trọng số mặc định, không trả trọng số sai schema', () => {
    const bad = { ...DEFAULT_CONFIDENCE_WEIGHTS, pLabel: Number.NaN };
    const r = fitConfidenceWeights(makeSamples(10), bad);
    expect(r.weights).toEqual(DEFAULT_CONFIDENCE_WEIGHTS);
  });

  it('prior hợp lệ nhưng bias dương (nới cổng) mà dữ liệu trống toàn "đúng" → ràng buộc làm loss tệ hơn → giữ nguyên prior', () => {
    const prior = { ...DEFAULT_CONFIDENCE_WEIGHTS, bias: 1.8 };
    const data = Array.from({ length: 100 }, (_, i) => ({
      signals: empty,
      correct: i >= 15,
    }));
    const r = fitConfidenceWeights(data, prior);
    expect(r.status).toBe('no_improvement');
    expect(r.weights).toEqual(prior);
  });

  it('property: mọi dữ liệu → tín hiệu trống < 0,80', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ signals, correct: fc.boolean() }), { minLength: 50, maxLength: 100 }),
        (s) => {
          const r = fitConfidenceWeights(s);
          expect(computeConfidence(empty, r.weights).confidence).toBeLessThan(0.8);
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('FR-163 property-based', () => {
  const sample = fc.record({ signals, correct: fc.boolean() });

  it('mọi dữ liệu → trọng số luôn hợp lệ theo schema, không ném', () => {
    fc.assert(
      fc.property(fc.array(sample, { minLength: 50, maxLength: 120 }), (s) => {
        const r = fitConfidenceWeights(s);
        expect(confidenceWeightsSchema.safeParse(r.weights).success).toBe(true);
        expect(r.logLossAfter).toBeLessThanOrEqual(r.logLossBefore + 1e-12);
      }),
      { numRuns: 25 },
    );
  }, 30_000); // CPU nặng; đo coverage trên CI chậm hơn mức 5 giây mặc định
});

describe('FR-163 đường hiệu chuẩn', () => {
  it('reliabilityCurve chia 10 khoảng, đếm đúng và tính tần suất đúng quan sát', () => {
    const curve = reliabilityCurve([
      { predicted: 0.05, correct: false },
      { predicted: 0.05, correct: true },
      { predicted: 1, correct: true },
    ]);
    expect(curve).toHaveLength(10);
    expect(curve[0]).toMatchObject({ count: 2, observedRate: 0.5 });
    expect(curve[9]).toMatchObject({ count: 1, observedRate: 1 });
    expect(curve[4]).toMatchObject({ count: 0, observedRate: null });
  });

  it('ECE = 0 khi dự đoán khớp hoàn toàn tần suất; rỗng → 0', () => {
    expect(expectedCalibrationError([])).toBe(0);
    expect(
      expectedCalibrationError([
        { predicted: 1, correct: true },
        { predicted: 0, correct: false },
      ]),
    ).toBe(0);
  });

  it('ECE trong [0,1] với mọi đầu vào', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ predicted: unit, correct: fc.boolean() }), { maxLength: 100 }),
        (pts) => {
          const e = expectedCalibrationError(pts);
          expect(e).toBeGreaterThanOrEqual(0);
          expect(e).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it('logLoss hữu hạn kể cả dự đoán 0/1 tuyệt đối', () => {
    expect(
      Number.isFinite(
        logLoss([
          { predicted: 1, correct: false },
          { predicted: 0, correct: true },
        ]),
      ),
    ).toBe(true);
    expect(logLoss([])).toBe(0);
  });
});
