import { REASON_HANDOFF_ACTION } from '../confidence/confidence';
import type { LlmClient } from '../llm-client';
import { DRAFT_RESPONSE_FORMAT } from '../llm-output';
import { guardVariants } from '../variation/variation';
import { type ActionBrief, buildDraftMessages, type DraftInput } from './draft-prompt';
import {
  type DraftResult,
  enforceClaimSources,
  needsHumanResult,
  parseDraftOutput,
} from './draft-result';

export const DRAFT_STEP = 'draft';
/**
 * Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). `@2`: hướng dẫn theo hành động (FR-147);
 * `@3`: thêm `variants[]` đa dạng diễn đạt (FR-161).
 */
export const DRAFT_PROMPT_VERSION = 'draft@3';
/** Nhiệt độ soạn thấp (FR-161: khởi điểm 0,3, chỉnh theo bộ đánh giá). */
export const DRAFT_TEMPERATURE = 0.3;
/** Ngưỡng liên quan mặc định; chưa hiệu chuẩn (chờ EVAL), người gọi có thể ghi đè. */
export const DEFAULT_MIN_RELEVANCE = 0.35;
export const REASON_NO_RELEVANT_SOURCE = 'Không có kiến thức liên quan';

export type { ActionBrief, DraftInput };

/** Một bước soạn trả lời (FR-029). Có bản LLM và bản fixture. */
export interface Drafter {
  draft(input: DraftInput): Promise<DraftResult>;
}

/** Câu hỏi lại / câu mời không chứa sự kiện nên không cần nguồn (FR-147); `answer` thì cần. */
function requiresSources(decision: ActionBrief | undefined): boolean {
  return decision === undefined || decision.action === 'answer';
}

/**
 * Bản LLM: `handoff` → không gọi LLM (chuyển người). `answer` không có nguồn đạt ngưỡng → KHÔNG gọi LLM,
 * trả `needs_human`; ngược lại ĐÚNG MỘT lần `llm.call` (NFR-C7), không gọi lại khi đầu ra hỏng — ném
 * `LLM_UNAVAILABLE`. Lỗi của `llm.call` được ném nguyên. Sau khi đọc, code kiểm nguồn của từng ý `fact` (FR-140).
 */
export function createLlmDrafter(options: { llm: LlmClient; model: string }): Drafter {
  return {
    async draft(input) {
      if (input.decision?.action === 'handoff') {
        return needsHumanResult(REASON_HANDOFF_ACTION, input.lang);
      }
      const threshold = input.minRelevance ?? DEFAULT_MIN_RELEVANCE;
      const sources = input.sources.filter((source) => source.relevance >= threshold);
      if (sources.length === 0 && requiresSources(input.decision)) {
        return needsHumanResult(REASON_NO_RELEVANT_SOURCE, input.lang);
      }

      const result = await options.llm.call({
        workspaceId: input.workspaceId,
        step: DRAFT_STEP,
        model: options.model,
        promptVersion: DRAFT_PROMPT_VERSION,
        messages: buildDraftMessages({ ...input, sources }),
        temperature: DRAFT_TEMPERATURE,
        // Đủ chỗ cho model suy luận + 3–5 biến thể; chỉ trả tiền phần dùng thật.
        maxTokens: 3000,
        responseFormat: DRAFT_RESPONSE_FORMAT,
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
