import { loadLlmModel } from '../llm-step-config';

/** Model bước viết lại câu hỏi LLM rẻ (FR-137): `REWRITE_LLM_MODEL`, bắt buộc, không mặc định. Bật/tắt: cờ DB `cf.ai.rewrite`. */
export type RewriteConfig = { model: string | null };

export function loadRewriteConfig(env: Record<string, string | undefined>): RewriteConfig {
  return { model: loadLlmModel(env, 'REWRITE_LLM_MODEL') };
}
