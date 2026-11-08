/**
 * Cấu hình một bước LLM theo env (FR-027/029/137): cờ `…_LLM_ENABLED` (chỉ đúng chữ `true`, mặc định TẮT) + tên model `…_LLM_MODEL`.
 * KHÔNG có model mặc định (chủ dự án chốt 08/11: không mock khi chạy): bật cờ mà thiếu tên model → `error` rõ ràng và bước đó TẮT
 * (nơi dùng báo lỗi khi khởi động hoặc hiện "chưa cấu hình AI"); không bao giờ gọi một model giả theo mặc định.
 */
export type LlmStepConfig = {
  /** Chỉ `true` khi cờ bật VÀ có tên model. */
  enabled: boolean;
  model: string | null;
  /** Mô tả vấn đề cấu hình (cờ bật nhưng thiếu model); `null` = ổn. Không chứa giá trị bí mật. */
  error: string | null;
};

export function loadLlmStepConfig(
  env: Record<string, string | undefined>,
  vars: { flag: string; model: string },
): LlmStepConfig {
  const flagOn = env[vars.flag] === 'true';
  const model = env[vars.model]?.trim() || null;
  if (!flagOn) return { enabled: false, model, error: null };
  if (!model) {
    return {
      enabled: false,
      model: null,
      error: `${vars.flag}=true nhưng thiếu ${vars.model} (tên model theo cấu hình LiteLLM, ví dụ cf-classify/cf-draft): bước này bị TẮT, không dùng model mặc định.`,
    };
  }
  return { enabled: true, model, error: null };
}
