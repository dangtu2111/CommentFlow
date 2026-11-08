import { type LlmStepConfig, loadLlmStepConfig } from '../llm-step-config';

/**
 * Cấu hình bước viết lại câu hỏi bằng LLM rẻ (FR-137). Cờ `REWRITE_LLM_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true`); model BẮT BUỘC khi bật
 * (`REWRITE_LLM_MODEL`, không có mặc định — xem `llm-step-config.ts`).
 */
export type RewriteConfig = LlmStepConfig;

export function loadRewriteConfig(env: Record<string, string | undefined>): RewriteConfig {
  return loadLlmStepConfig(env, { flag: 'REWRITE_LLM_ENABLED', model: 'REWRITE_LLM_MODEL' });
}
