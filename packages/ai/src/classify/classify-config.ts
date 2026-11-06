/**
 * Cấu hình bước phân loại LLM (FR-027). Cờ MẶC ĐỊNH TẮT: chỉ đúng chữ `true` mới bật (đường dùng
 * khóa LLM trả phí). Model mặc định `mock-llm` = model duy nhất của khóa dev.
 */
export type ClassifyConfig = { enabled: boolean; model: string };

export const DEFAULT_CLASSIFY_MODEL = 'mock-llm';

export function loadClassifyConfig(env: Record<string, string | undefined>): ClassifyConfig {
  const model = env.CLASSIFY_LLM_MODEL?.trim();
  return {
    enabled: env.CLASSIFY_LLM_ENABLED === 'true',
    model: model ? model : DEFAULT_CLASSIFY_MODEL,
  };
}
