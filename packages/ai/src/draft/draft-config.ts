import { type LlmStepConfig, loadLlmStepConfig } from '../llm-step-config';

/**
 * Cấu hình bước soạn trả lời bằng LLM (FR-029). Cờ `DRAFT_LLM_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true`); model BẮT BUỘC khi bật
 * (`DRAFT_LLM_MODEL`, không có mặc định — xem `llm-step-config.ts`).
 */
export type DraftConfig = LlmStepConfig;

export function loadDraftConfig(env: Record<string, string | undefined>): DraftConfig {
  return loadLlmStepConfig(env, { flag: 'DRAFT_LLM_ENABLED', model: 'DRAFT_LLM_MODEL' });
}
