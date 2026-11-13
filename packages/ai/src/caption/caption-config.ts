import { loadLlmModel } from '../llm-step-config';

/** Model bước soạn caption/hashtag (POST-PUBLISHING): `CAPTION_LLM_MODEL`, bắt buộc, KHÔNG có mặc định. Bật/tắt: cờ DB `cf.ai.caption` theo workspace. */
export type CaptionConfig = { model: string | null };

export function loadCaptionConfig(env: Record<string, string | undefined>): CaptionConfig {
  return { model: loadLlmModel(env, 'CAPTION_LLM_MODEL') };
}
