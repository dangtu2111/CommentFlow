/**
 * Cấu hình bước viết lại câu hỏi bằng LLM rẻ (FR-137). Cờ MẶC ĐỊNH TẮT: chỉ đúng chữ `true` mới bật
 * (đường dùng khóa LLM trả phí). Model mặc định `mock-llm` = model duy nhất của khóa dev.
 */
export type RewriteConfig = { enabled: boolean; model: string };

export const DEFAULT_REWRITE_MODEL = 'mock-llm';

export function loadRewriteConfig(env: Record<string, string | undefined>): RewriteConfig {
  const model = env.REWRITE_LLM_MODEL?.trim();
  return {
    enabled: env.REWRITE_LLM_ENABLED === 'true',
    model: model ? model : DEFAULT_REWRITE_MODEL,
  };
}
