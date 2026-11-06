import {
  type ConfidenceWeights,
  computeConfidence,
  confidenceWeightsSchema,
  DEFAULT_CONFIDENCE_WEIGHTS,
  readConfidenceSignals,
  sigmoid,
} from '../confidence';
import { THRESHOLD_FLOOR } from '../gate/auto-send-gate';
import { CALIBRATION_MIN_SAMPLES } from './threshold-calibration';

/**
 * Hiệu chuẩn TRỌNG SỐ độ tin cậy bằng hồi quy logistic (FR-163, `docs/09` §6.0, Q-AC1).
 *
 * Hàm THUẦN: nhận mẫu (tín hiệu đo được + câu "đúng" = nhân viên gửi nguyên văn, "sai" = sửa/bỏ) đã lọc theo
 * (kênh, nhãn, ngôn ngữ) và trả trọng số ĐỀ XUẤT. Không tự áp dụng — Owner xác nhận như FR-072. Không gọi LLM,
 * không dùng điểm model tự chấm (nguyên tắc #9). Tín hiệu thiếu tính 0, đúng như `computeConfidence`.
 *
 * Giữ ràng buộc của `confidenceWeightsSchema`: hệ số tín hiệu ≥ 0 (chiếu về 0 khi gradient kéo âm), mọi số hữu hạn.
 * Kéo nhẹ về trọng số mặc định (L2) để ít mẫu không làm lệch mạnh; chỉ nhận khi log-loss không tệ hơn mặc định.
 */

export const CONFIDENCE_FIT_MIN_PER_CLASS = 10;
const ITERATIONS = 2000;
const LEARNING_RATE = 0.8;
const L2 = 0.005;
const WEIGHT_MAX = 50;
const RELIABILITY_BINS = 10;
const P_EPS = 1e-12;

export type ConfidenceFitSample = { signals: unknown; correct: boolean };

export type SignalFeatures = {
  pLabel: number;
  sProduct: number;
  sRetrievalTop1: number;
  retrievalMargin: number;
  factSourcedRatio: number;
  actionAnswer: 0 | 1;
  askedBefore: 0 | 1;
};

/** Đặc trưng đúng như `computeConfidence` (thiếu → 0; margin chỉ khi có cả top1 và top2). Hỏng → `null`. */
export function signalFeatures(raw: unknown): SignalFeatures | null {
  const s = readConfidenceSignals(raw);
  if (s === null) return null;
  const top1 = s.sRetrievalTop1 ?? 0;
  const margin =
    s.sRetrievalTop1 === null || s.sRetrievalTop2 === null
      ? 0
      : Math.max(0, top1 - s.sRetrievalTop2);
  return {
    pLabel: s.pLabel ?? 0,
    sProduct: s.sProduct ?? 0,
    sRetrievalTop1: top1,
    retrievalMargin: margin,
    factSourcedRatio: s.factSourcedRatio ?? 0,
    actionAnswer: s.action === 'answer' ? 1 : 0,
    askedBefore: s.askedBefore ? 1 : 0,
  };
}

// Tham số: [bias, pLabel, sProduct, sRetrievalTop1, retrievalMargin, factSourcedRatio, actionAnswer, askedBefore]
function toVector(f: SignalFeatures): number[] {
  return [
    1,
    f.pLabel,
    f.sProduct,
    f.sRetrievalTop1,
    f.retrievalMargin,
    f.factSourcedRatio,
    f.actionAnswer,
    -f.askedBefore, // hệ số `askedBefore` là số dương bị TRỪ đi
  ];
}

function toParams(w: ConfidenceWeights): number[] {
  return [
    w.bias,
    w.pLabel,
    w.sProduct,
    w.sRetrievalTop1,
    w.retrievalMargin,
    w.factSourcedRatio,
    w.actionAnswer,
    w.askedBefore,
  ];
}

function toWeights(p: readonly number[], version: string): ConfidenceWeights {
  const [
    bias,
    pLabel,
    sProduct,
    sRetrievalTop1,
    retrievalMargin,
    factSourcedRatio,
    actionAnswer,
    askedBefore,
  ] = p as [number, number, number, number, number, number, number, number];
  return {
    version,
    bias,
    pLabel,
    sProduct,
    sRetrievalTop1,
    retrievalMargin,
    factSourcedRatio,
    actionAnswer,
    askedBefore,
  };
}

const dot = (p: readonly number[], x: readonly number[]) =>
  p.reduce((sum, pi, i) => sum + pi * (x[i] ?? 0), 0);

export type PredictionPoint = { predicted: number; correct: boolean };

export function logLoss(points: readonly PredictionPoint[]): number {
  if (points.length === 0) return 0;
  const total = points.reduce((sum, { predicted, correct }) => {
    const p = Math.min(1 - P_EPS, Math.max(P_EPS, predicted));
    return sum - Math.log(correct ? p : 1 - p);
  }, 0);
  return total / points.length;
}

export type ReliabilityBin = {
  lower: number;
  upper: number;
  count: number;
  meanPredicted: number | null;
  /** Tần suất "đúng" quan sát được; `null` khi khoảng trống. */
  observedRate: number | null;
};

/** Đường hiệu chuẩn (reliability): 10 khoảng đều trên [0,1]; điểm 1 rơi vào khoảng cuối. */
export function reliabilityCurve(points: readonly PredictionPoint[]): ReliabilityBin[] {
  const bins = Array.from({ length: RELIABILITY_BINS }, (_, i) => ({
    lower: i / RELIABILITY_BINS,
    upper: (i + 1) / RELIABILITY_BINS,
    count: 0,
    sumPredicted: 0,
    sumCorrect: 0,
  }));
  for (const { predicted, correct } of points) {
    if (!Number.isFinite(predicted)) continue;
    const clamped = Math.min(1, Math.max(0, predicted));
    const bin = bins[Math.min(RELIABILITY_BINS - 1, Math.floor(clamped * RELIABILITY_BINS))];
    if (!bin) continue;
    bin.count += 1;
    bin.sumPredicted += clamped;
    bin.sumCorrect += correct ? 1 : 0;
  }
  return bins.map((b) => ({
    lower: b.lower,
    upper: b.upper,
    count: b.count,
    meanPredicted: b.count === 0 ? null : b.sumPredicted / b.count,
    observedRate: b.count === 0 ? null : b.sumCorrect / b.count,
  }));
}

/** Sai số hiệu chuẩn kỳ vọng (ECE): trung bình có trọng số của |dự đoán − tần suất quan sát| theo khoảng. */
export function expectedCalibrationError(points: readonly PredictionPoint[]): number {
  const curve = reliabilityCurve(points);
  const total = curve.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return 0;
  return curve.reduce(
    (sum, b) =>
      b.meanPredicted === null || b.observedRate === null
        ? sum
        : sum + (b.count / total) * Math.abs(b.meanPredicted - b.observedRate),
    0,
  );
}

export type ConfidenceFitStatus = 'insufficient_data' | 'no_improvement' | 'ready';

export type ConfidenceFitResult = {
  status: ConfidenceFitStatus;
  /** Trọng số đề xuất; mặc định khi chưa đủ dữ liệu / không cải thiện. */
  weights: ConfidenceWeights;
  sampleCount: number;
  ignoredCount: number;
  logLossBefore: number;
  logLossAfter: number;
  eceBefore: number;
  eceAfter: number;
};

type Prepared = { x: number[]; y: 0 | 1 };

function predictAll(params: readonly number[], data: readonly Prepared[]): PredictionPoint[] {
  return data.map(({ x, y }) => ({ predicted: sigmoid(dot(params, x)), correct: y === 1 }));
}

function descend(prior: readonly number[], data: readonly Prepared[]): number[] {
  const params = [...prior];
  const n = data.length;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const grad = new Array<number>(params.length).fill(0);
    for (const { x, y } of data) {
      const err = sigmoid(dot(params, x)) - y;
      for (let i = 0; i < params.length; i++) grad[i] = (grad[i] ?? 0) + err * (x[i] ?? 0);
    }
    for (let i = 0; i < params.length; i++) {
      const g = (grad[i] ?? 0) / n + L2 * ((params[i] ?? 0) - (prior[i] ?? 0));
      let next = (params[i] ?? 0) - LEARNING_RATE * g;
      next = Math.min(WEIGHT_MAX, Math.max(-WEIGHT_MAX, next));
      params[i] = i === 0 ? next : Math.max(0, next); // hệ số tín hiệu ≥ 0
    }
    // Thiếu mọi tín hiệu + action=answer không được vượt 0,5 (thiếu tín hiệu = thiên về chặn).
    params[0] = Math.min(params[0] ?? 0, -(params[6] ?? 0));
  }
  return params;
}

/** Bản nháp không đo được tín hiệu nào (chỉ `action = answer`) phải dưới sàn ngưỡng 0,80 (thiên về chặn). */
function failsClosedWithoutSignals(weights: ConfidenceWeights): boolean {
  const empty = {
    pLabel: null,
    sProduct: null,
    sRetrievalTop1: null,
    sRetrievalTop2: null,
    factSourcedRatio: null,
    action: 'answer',
    askedBefore: false,
  };
  return computeConfidence(empty, weights).confidence < THRESHOLD_FLOOR;
}

export function fitConfidenceWeights(
  samples: readonly ConfidenceFitSample[],
  rawPrior: ConfidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS,
): ConfidenceFitResult {
  const prior = confidenceWeightsSchema.safeParse(rawPrior).success
    ? rawPrior
    : DEFAULT_CONFIDENCE_WEIGHTS;
  const input: readonly unknown[] = Array.isArray(samples) ? samples : [];
  const data: Prepared[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue;
    const { signals, correct } = item as Record<string, unknown>;
    const f = signalFeatures(signals);
    if (f === null || typeof correct !== 'boolean') continue;
    data.push({ x: toVector(f), y: correct ? 1 : 0 });
  }

  const priorParams = toParams(prior);
  const before = predictAll(priorParams, data);
  const common = {
    sampleCount: data.length,
    ignoredCount: input.length - data.length,
    logLossBefore: logLoss(before),
    eceBefore: expectedCalibrationError(before),
  };
  const unchanged = (status: ConfidenceFitStatus): ConfidenceFitResult => ({
    status,
    weights: prior,
    ...common,
    logLossAfter: common.logLossBefore,
    eceAfter: common.eceBefore,
  });

  const positives = data.filter((d) => d.y === 1).length;
  const minority = Math.min(positives, data.length - positives);
  if (data.length < CALIBRATION_MIN_SAMPLES || minority < CONFIDENCE_FIT_MIN_PER_CLASS) {
    return unchanged('insufficient_data');
  }

  const fitted = descend(priorParams, data);
  const after = predictAll(fitted, data);
  const logLossAfter = logLoss(after);
  const fittedWeights = toWeights(fitted, `calibrated@${data.length}`);
  if (!(logLossAfter <= common.logLossBefore) || !failsClosedWithoutSignals(fittedWeights)) {
    return unchanged('no_improvement');
  }

  return {
    status: 'ready',
    weights: fittedWeights,
    ...common,
    logLossAfter,
    eceAfter: expectedCalibrationError(after),
  };
}
