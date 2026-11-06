import { z } from 'zod';

/**
 * Độ tin cậy do CODE tính (FR-163, `docs/09` §6.0), không dùng số model tự chấm (nguyên tắc #9):
 *
 *   z = w0 + w1·p_label + w2·s_product + w3·s_retrieval_top1 + w4·(s_top1 − s_top2)
 *         + w5·fact_sourced_ratio + w6·[action = answer] − w7·[đã hỏi lại trước đó]
 *   confidence = sigmoid(z)
 *
 * Đầu vào không đọc được (FR-032) → 0 và chuyển người; không bao giờ ném.
 * `components` (snake_case) lưu vào `drafts.confidence_components` để giải thích "Không tự gửi vì…".
 */

export const ACTION_KINDS = ['answer', 'clarify', 'redirect', 'handoff'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const REASON_UNREADABLE = 'Kết quả AI không đọc được';
export const REASON_HANDOFF_ACTION = 'Hành động chuyển người';

/** Trọng số mặc định cho tới khi đủ dữ liệu hiệu chuẩn (AUTO-CALIBRATION). Đổi → tăng `version`. */
export const CONFIDENCE_WEIGHTS_VERSION = 'default@1';

export type ConfidenceWeights = {
  version: string;
  bias: number;
  pLabel: number;
  sProduct: number;
  sRetrievalTop1: number;
  retrievalMargin: number;
  factSourcedRatio: number;
  actionAnswer: number;
  /** Trừ đi khi đã hỏi lại trước đó (số dương). */
  askedBefore: number;
};

/** Trọng số phải hữu hạn; các hệ số tín hiệu ≥ 0 để giữ tính đơn điệu (tín hiệu tốt không làm điểm giảm). */
const nonNegative = z.number().finite().min(0);
export const confidenceWeightsSchema = z.object({
  version: z.string().min(1),
  bias: z.number().finite(),
  pLabel: nonNegative,
  sProduct: nonNegative,
  sRetrievalTop1: nonNegative,
  retrievalMargin: nonNegative,
  factSourcedRatio: nonNegative,
  actionAnswer: nonNegative,
  askedBefore: nonNegative,
});

export const DEFAULT_CONFIDENCE_WEIGHTS: ConfidenceWeights = Object.freeze({
  version: CONFIDENCE_WEIGHTS_VERSION,
  bias: -10,
  pLabel: 5,
  sProduct: 1.5,
  sRetrievalTop1: 4,
  retrievalMargin: 2,
  factSourcedRatio: 3.5,
  actionAnswer: 1,
  askedBefore: 1,
});

/** Điểm trong [0,1]; thiếu (null) = chưa đo được, tính 0 (thiên về chặn). */
const unitOrNull = z.number().finite().min(0).max(1).nullable();

/**
 * Tín hiệu đo được. Trường lạ (kể cả `confidence`/`self_score` model tự ghi) bị bỏ khi đọc.
 * `pLabel` là xác suất nhãn từ ml/logprob/tự nhất quán — chỉ là một tín hiệu, không phải điểm cuối.
 */
export const confidenceSignalsSchema = z.object({
  pLabel: unitOrNull,
  sProduct: unitOrNull,
  sRetrievalTop1: unitOrNull,
  sRetrievalTop2: unitOrNull,
  factSourcedRatio: unitOrNull,
  action: z.enum(ACTION_KINDS),
  askedBefore: z.boolean(),
});

export type ConfidenceSignals = z.input<typeof confidenceSignalsSchema>;

export type ConfidenceTerms = {
  bias: number;
  p_label: number;
  s_product: number;
  s_retrieval_top1: number;
  s_retrieval_margin: number;
  fact_sourced_ratio: number;
  action_answer: number;
  asked_before: number;
};

/** Thành phần lưu `drafts.confidence_components` (FR-163). */
export type ConfidenceComponents = {
  weights_version: string;
  p_label: number;
  s_product: number;
  s_retrieval_top1: number;
  s_retrieval_margin: number;
  fact_sourced_ratio: number;
  action: ActionKind;
  action_answer: 0 | 1;
  asked_before: 0 | 1;
  terms: ConfidenceTerms;
  weights: ConfidenceWeights;
  z: number;
};

export type ConfidenceResult = {
  /** Trong [0,1]; 0 khi không đọc được. */
  confidence: number;
  needsHuman: boolean;
  reason: string | null;
  /** `null` khi không đọc được (FR-032). */
  components: ConfidenceComponents | null;
};

export function sigmoid(z: number): number {
  if (z === Number.POSITIVE_INFINITY) return 1;
  if (z === Number.NEGATIVE_INFINITY) return 0;
  return 1 / (1 + Math.exp(-z));
}

/** Đọc tín hiệu từ dữ liệu bất kỳ; không đúng dạng (kể cả hành động lạ) → `null`. */
export function readConfidenceSignals(
  raw: unknown,
): z.output<typeof confidenceSignalsSchema> | null {
  const parsed = confidenceSignalsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Kết quả FR-032: không đọc được → 0, chuyển người. */
export function unreadableConfidence(): ConfidenceResult {
  return { confidence: 0, needsHuman: true, reason: REASON_UNREADABLE, components: null };
}

/**
 * Tính độ tin cậy từ tín hiệu (nhận `unknown` để mọi đầu vào hỏng đều về 0 thay vì ném).
 * `handoff` luôn cần người dù điểm cao (`docs/09` §6 mục 6).
 */
export function computeConfidence(
  raw: unknown,
  weights: ConfidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS,
): ConfidenceResult {
  const signals = readConfidenceSignals(raw);
  // Trọng số hỏng (NaN/vô cực/âm — ví dụ đọc nhầm từ bảng hiệu chuẩn) → không tính được, về 0.
  if (signals === null || !confidenceWeightsSchema.safeParse(weights).success) {
    return unreadableConfidence();
  }

  const pLabel = signals.pLabel ?? 0;
  const sProduct = signals.sProduct ?? 0;
  const sTop1 = signals.sRetrievalTop1 ?? 0;
  // Thiếu top1 HOẶC top2 → không có khoảng cách (thiếu tín hiệu không được cộng điểm); top2 > top1 → 0.
  const margin =
    signals.sRetrievalTop1 === null || signals.sRetrievalTop2 === null
      ? 0
      : Math.max(0, sTop1 - signals.sRetrievalTop2);
  const factRatio = signals.factSourcedRatio ?? 0;
  const actionAnswer = signals.action === 'answer' ? 1 : 0;
  const askedBefore = signals.askedBefore ? 1 : 0;

  const terms: ConfidenceTerms = {
    bias: weights.bias,
    p_label: weights.pLabel * pLabel,
    s_product: weights.sProduct * sProduct,
    s_retrieval_top1: weights.sRetrievalTop1 * sTop1,
    s_retrieval_margin: weights.retrievalMargin * margin,
    fact_sourced_ratio: weights.factSourcedRatio * factRatio,
    action_answer: weights.actionAnswer * actionAnswer,
    asked_before: askedBefore === 1 ? -weights.askedBefore : 0,
  };
  const z = Object.values(terms).reduce((sum, term) => sum + term, 0);

  return {
    confidence: sigmoid(z),
    needsHuman: signals.action === 'handoff',
    reason: signals.action === 'handoff' ? REASON_HANDOFF_ACTION : null,
    components: {
      weights_version: weights.version,
      p_label: pLabel,
      s_product: sProduct,
      s_retrieval_top1: sTop1,
      s_retrieval_margin: margin,
      fact_sourced_ratio: factRatio,
      action: signals.action,
      action_answer: actionAnswer,
      asked_before: askedBefore,
      terms,
      weights,
      z,
    },
  };
}
