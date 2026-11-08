import { type LlmStepConfig, loadLlmStepConfig } from '../llm-step-config';

/**
 * Cấu hình bước phân loại LLM (FR-027). Cờ `CLASSIFY_LLM_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true`); model BẮT BUỘC khi bật
 * (`CLASSIFY_LLM_MODEL`, không có mặc định — xem `llm-step-config.ts`).
 */
export type ClassifyConfig = LlmStepConfig;

export function loadClassifyConfig(env: Record<string, string | undefined>): ClassifyConfig {
  return loadLlmStepConfig(env, { flag: 'CLASSIFY_LLM_ENABLED', model: 'CLASSIFY_LLM_MODEL' });
}
