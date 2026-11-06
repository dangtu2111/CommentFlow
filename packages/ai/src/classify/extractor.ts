import type { LlmClient } from '../llm-client';
import { buildExtractMessages, type ExtractInput } from './extract-prompt';
import { type ExtractResult, parseExtractOutput } from './extract-result';

export const EXTRACT_STEP = 'extract';
/** Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). */
export const EXTRACT_PROMPT_VERSION = 'extract@1';

export type { ExtractInput };

/** Một bước phân loại + tách thông tin (FR-027/145/162). Có bản LLM và bản fixture. */
export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractResult>;
}

/**
 * Bản LLM: ĐÚNG MỘT lần `llm.call` (NFR-C7), không gọi lại khi đầu ra hỏng — ném
 * `LLM_UNAVAILABLE` để bước sau chuyển người (FR-032). Lỗi của `llm.call` được ném nguyên.
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
        maxTokens: 600,
      });
      return parseExtractOutput(result.text);
    },
  };
}
