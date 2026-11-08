import { loadLlmModel } from '../llm-step-config';

/** Model bước soạn trả lời LLM (FR-029): `DRAFT_LLM_MODEL`, bắt buộc, không mặc định. Bật/tắt: cờ DB `cf.ai.draft`. */
export type DraftConfig = { model: string | null };

export function loadDraftConfig(env: Record<string, string | undefined>): DraftConfig {
  return { model: loadLlmModel(env, 'DRAFT_LLM_MODEL') };
}
