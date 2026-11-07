import type { LlmClient } from '../llm-client';
import { EXTRACT_RESPONSE_FORMAT } from '../llm-output';
import { buildExtractMessages, type ExtractInput } from './extract-prompt';
import { type ExtractResult, parseExtractOutput } from './extract-result';
import { consistencyOf, type LabelSignal, labelProbabilityFromLogprobs } from './label-signal';

export const EXTRACT_STEP = 'extract';
/** Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). */
export const EXTRACT_PROMPT_VERSION = 'extract@2'; // @2: bỏ điểm tin cậy tự ghi của LLM, nhãn chính đứng đầu

export type { ExtractInput };

/** Kết quả extract + tín hiệu xác suất nhãn (nếu có) để tính `p_label` — KHÔNG phải số mô hình tự ghi. */
export type ExtractOutcome = ExtractResult & { labelSignal?: LabelSignal };

/** Một bước phân loại + tách thông tin (FR-027/145/162). Có bản LLM và bản fixture. */
export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractOutcome>;
}

/**
 * Bản LLM: ĐÚNG MỘT lần `llm.call` (NFR-C7), không gọi lại khi đầu ra hỏng — ném
 * `LLM_UNAVAILABLE` để bước sau chuyển người (FR-032). Lỗi của `llm.call` được ném nguyên.
 * Xin logprob; nếu nhà cung cấp trả về thì `labelSignal.logprob` = xác suất của giá trị nhãn chính.
 */
export function createLlmExtractor(options: { llm: LlmClient; model: string }): Extractor {
  return {
    async extract(input) {
      const result = await options.llm.call({
        workspaceId: input.workspaceId,
        step: EXTRACT_STEP,
        model: options.model,
        promptVersion: EXTRACT_PROMPT_VERSION,
        messages: buildExtractMessages(input),
        temperature: 0,
        // Đủ chỗ cho model suy luận (token suy luận tính vào trần); chỉ trả tiền phần dùng thật.
        maxTokens: 2000,
        logprobs: true,
        responseFormat: EXTRACT_RESPONSE_FORMAT,
      });
      const parsed = parseExtractOutput(result.text);
      const primary = parsed.labels[0]?.label;
      const logprob =
        primary === undefined ? null : labelProbabilityFromLogprobs(result.logprobs, primary);
      return logprob === null ? parsed : { ...parsed, labelSignal: { logprob } };
    },
  };
}

/**
 * Tự nhất quán (docs/09 §6.0): khi bản gốc KHÔNG trả `ml`/`logprob`, chạy thêm `extraRuns` lần độc lập rồi lấy tỉ lệ
 * trùng nhãn chính làm `consistency` ("2 lần gọi rẻ"). Có sẵn `ml`/`logprob` → không gọi thêm. Một lần chạy phụ hỏng
 * KHÔNG làm hỏng kết quả: lần đó bị bỏ khỏi phép đếm.
 */
export function withSelfConsistency(
  base: Extractor,
  options: { extraRuns?: number } = {},
): Extractor {
  const extraRuns = options.extraRuns ?? 1;
  return {
    async extract(input) {
      const first = await base.extract(input);
      const known = first.labelSignal;
      if (known?.ml != null || known?.logprob != null) return first;
      const primaries = [first.labels[0]?.label];
      for (let i = 0; i < extraRuns; i += 1) {
        const again = await base.extract(input).catch(() => null);
        if (again) primaries.push(again.labels[0]?.label);
      }
      const labels = primaries.filter(
        (label): label is NonNullable<typeof label> => label !== undefined,
      );
      const consistency = consistencyOf(labels);
      return consistency === null ? first : { ...first, labelSignal: { ...known, consistency } };
    },
  };
}
