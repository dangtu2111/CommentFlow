import { type DraftResult, parseDraftOutput } from '../draft/draft-result';
import {
  type ConfidenceResult,
  type ConfidenceSignals,
  type ConfidenceWeights,
  computeConfidence,
  DEFAULT_CONFIDENCE_WEIGHTS,
  unreadableConfidence,
} from './confidence';

/** Kết quả đọc bản nháp: đọc được hay không (FR-032). */
export type DraftOutcome = { ok: true; draft: DraftResult } | { ok: false; error: unknown };

/** Đọc đầu ra LLM của bước `draft` mà không ném: mọi lỗi đọc → `ok: false` (FR-032). */
export function readDraftOutcome(text: string): DraftOutcome {
  try {
    return { ok: true, draft: parseDraftOutput(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Tỉ lệ ý `fact` có nguồn (FR-140 → tín hiệu FR-163), tính bằng code từ `claims`.
 * Có `allowedSourceIds` → nguồn ngoài tập đã đưa vào prompt không được tính. Không có ý `fact` → 1.
 */
export function factSourcedRatio(
  draft: DraftResult,
  allowedSourceIds?: ReadonlySet<string>,
): number {
  const facts = draft.claims.filter((claim) => claim.kind === 'fact');
  if (facts.length === 0) return 1;
  const sourced = facts.filter(
    (claim) =>
      claim.source_ids.length > 0 &&
      (allowedSourceIds === undefined || claim.source_ids.every((id) => allowedSourceIds.has(id))),
  );
  return sourced.length / facts.length;
}

export type AssessDraftInput = {
  outcome: DraftOutcome;
  /** Tín hiệu đo được; `factSourcedRatio` (nếu có) bị bỏ — luôn tính lại từ `claims`. */
  signals: Omit<ConfidenceSignals, 'factSourcedRatio'>;
  allowedSourceIds?: ReadonlySet<string>;
  weights?: ConfidenceWeights;
};

/**
 * Độ tin cậy của một bản nháp: không đọc được → 0 + chuyển người (FR-032); đọc được → công thức §6.0
 * với `fact_sourced_ratio` tính từ `claims`. Bản nháp tự `needs_human` → giữ cần người với lý do của nó.
 */
export function assessDraft(input: AssessDraftInput): ConfidenceResult {
  if (!input.outcome.ok) return unreadableConfidence();
  const { draft } = input.outcome;
  const { factSourcedRatio: _ignored, ...signals } = input.signals as ConfidenceSignals;
  const result = computeConfidence(
    { ...signals, factSourcedRatio: factSourcedRatio(draft, input.allowedSourceIds) },
    input.weights ?? DEFAULT_CONFIDENCE_WEIGHTS,
  );
  if (result.components === null || result.needsHuman || !draft.needs_human) return result;
  return { ...result, needsHuman: true, reason: draft.reason };
}
