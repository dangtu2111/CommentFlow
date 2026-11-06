import { type DraftResult, parseDraftOutput } from '../draft/draft-result';
import {
  type ActionKind,
  type ConfidenceResult,
  type ConfidenceSignals,
  type ConfidenceWeights,
  computeConfidence,
  DEFAULT_CONFIDENCE_WEIGHTS,
  unreadableConfidence,
} from './confidence';

/** Lý do cố định khi bản nháp tự đề nghị chuyển người (không chép chữ tự do của AI — nguyên tắc #6). */
export const REASON_DRAFT_NEEDS_HUMAN = 'Bản nháp đề nghị chuyển người';

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
 * Tỉ lệ ý `fact` có nguồn (FR-140 → tín hiệu FR-163), tính bằng code từ `claims`; chỉ nguồn thuộc tập
 * ĐÃ đưa vào prompt mới được tính. Không có ý `fact`: câu `answer` có nội dung → 0 (AI tự khai loại ý nên
 * "không fact" không được coi là đã có nguồn); `clarify`/`redirect`/`handoff` hoặc câu rỗng → 1.
 */
export function factSourcedRatio(
  draft: DraftResult,
  allowedSourceIds: ReadonlySet<string>,
  action: ActionKind,
): number {
  const facts = draft.claims.filter((claim) => claim.kind === 'fact');
  if (facts.length === 0) return action === 'answer' && draft.reply !== '' ? 0 : 1;
  const sourced = facts.filter(
    (claim) =>
      claim.source_ids.length > 0 && claim.source_ids.every((id) => allowedSourceIds.has(id)),
  );
  return sourced.length / facts.length;
}

export type AssessDraftInput = {
  outcome: DraftOutcome;
  /** Tín hiệu đo được; `factSourcedRatio` (nếu có) bị bỏ — luôn tính lại từ `claims`. */
  signals: Omit<ConfidenceSignals, 'factSourcedRatio'>;
  /** Tập id nguồn đã đưa vào prompt (bắt buộc: id AI bịa không được tính là có nguồn). */
  allowedSourceIds: ReadonlySet<string>;
  weights?: ConfidenceWeights;
};

/**
 * Độ tin cậy của một bản nháp: không đọc được → 0 + chuyển người (FR-032); đọc được → công thức §6.0
 * với `fact_sourced_ratio` tính từ `claims`. Bản nháp tự `needs_human` → giữ cần người. Không bao giờ ném:
 * dữ liệu sai dạng lúc chạy cũng về 0.
 */
export function assessDraft(input: AssessDraftInput): ConfidenceResult {
  try {
    if (!input.outcome.ok) return unreadableConfidence();
    const { draft } = input.outcome;
    const { factSourcedRatio: _ignored, ...signals } = input.signals as ConfidenceSignals;
    const action = signals.action;
    const result = computeConfidence(
      { ...signals, factSourcedRatio: factSourcedRatio(draft, input.allowedSourceIds, action) },
      input.weights ?? DEFAULT_CONFIDENCE_WEIGHTS,
    );
    if (result.components === null || result.needsHuman || !draft.needs_human) return result;
    return { ...result, needsHuman: true, reason: REASON_DRAFT_NEEDS_HUMAN };
  } catch {
    return unreadableConfidence();
  }
}
