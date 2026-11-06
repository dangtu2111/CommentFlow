import type { LlmClient } from '../llm-client';
import { guardVariants } from '../variation/variation';
import { buildDraftMessages, type DraftInput } from './draft-prompt';
import {
  type DraftResult,
  enforceClaimSources,
  needsHumanResult,
  parseDraftOutput,
} from './draft-result';

export const DRAFT_STEP = 'draft';
/** Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). */
export const DRAFT_PROMPT_VERSION = 'draft@2';
/** Nhiệt độ soạn thấp (FR-161: khởi điểm 0,3, chỉnh theo bộ đánh giá). */
export const DRAFT_TEMPERATURE = 0.3;
/** Ngưỡng liên quan mặc định; chưa hiệu chuẩn (chờ EVAL), người gọi có thể ghi đè. */
export const DEFAULT_MIN_RELEVANCE = 0.35;
export const REASON_NO_RELEVANT_SOURCE = 'Không có kiến thức liên quan';

export type { DraftInput };

/** Một bước soạn trả lời (FR-029). Có bản LLM và bản fixture. */
export interface Drafter {
  draft(input: DraftInput): Promise<DraftResult>;
}

/**
 * Bản LLM: không có nguồn đạt ngưỡng → KHÔNG gọi LLM, trả `needs_human`; ngược lại ĐÚNG MỘT lần `llm.call`
 * (NFR-C7), không gọi lại khi đầu ra hỏng — ném `LLM_UNAVAILABLE`. Lỗi của `llm.call` được ném nguyên.
 * Sau khi đọc, code kiểm nguồn của từng ý `fact` (FR-140).
 */
export function createLlmDrafter(options: { llm: LlmClient; model: string }): Drafter {
  return {
    async draft(input) {
      const threshold = input.minRelevance ?? DEFAULT_MIN_RELEVANCE;
      const sources = input.sources.filter((source) => source.relevance >= threshold);
      if (sources.length === 0) return needsHumanResult(REASON_NO_RELEVANT_SOURCE, input.lang);

      const result = await options.llm.call({
        workspaceId: input.workspaceId,
        step: DRAFT_STEP,
        model: options.model,
        promptVersion: DRAFT_PROMPT_VERSION,
        messages: buildDraftMessages({ ...input, sources }),
        temperature: DRAFT_TEMPERATURE,
        maxTokens: 1200,
        draftId: input.draftId,
      });
      const checked = enforceClaimSources(
        parseDraftOutput(result.text),
        new Set(sources.map((source) => source.id)),
      );
      if (checked.needs_human) return checked;
      const { variants } = guardVariants({
        reply: checked.reply,
        variants: checked.variants,
        sources: sources.map((source) => source.text),
      });
      return { ...checked, variants };
    },
  };
}
