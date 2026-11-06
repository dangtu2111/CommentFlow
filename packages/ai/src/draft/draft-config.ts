/**
 * Cấu hình bước soạn trả lời bằng LLM (FR-029). Cờ MẶC ĐỊNH TẮT: chỉ đúng chữ `true` mới bật (đường dùng
 * khóa LLM trả phí). Model mặc định `mock-llm` = model duy nhất của khóa dev.
 */
export type DraftConfig = { enabled: boolean; model: string };

export const DEFAULT_DRAFT_MODEL = 'mock-llm';

export function loadDraftConfig(env: Record<string, string | undefined>): DraftConfig {
  const model = env.DRAFT_LLM_MODEL?.trim();
  return {
    enabled: env.DRAFT_LLM_ENABLED === 'true',
    model: model ? model : DEFAULT_DRAFT_MODEL,
  };
}
