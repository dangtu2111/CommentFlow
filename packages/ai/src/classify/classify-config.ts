import { loadLlmModel } from '../llm-step-config';

/** Model bước phân loại LLM (FR-027): `CLASSIFY_LLM_MODEL`, bắt buộc, không mặc định. Bật/tắt: cờ DB `cf.ai.classify`. */
export type ClassifyConfig = { model: string | null };

export function loadClassifyConfig(env: Record<string, string | undefined>): ClassifyConfig {
  return { model: loadLlmModel(env, 'CLASSIFY_LLM_MODEL') };
}
