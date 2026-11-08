/**
 * Tên model của một bước LLM theo env (`CLASSIFY_LLM_MODEL`, `DRAFT_LLM_MODEL`, `REWRITE_LLM_MODEL`). Env chỉ còn ĐỊA CHỈ dịch vụ, khóa và TÊN MODEL;
 * bật/tắt bước là feature flag DB (`cf.ai.classify|draft|rewrite`, docs/09 §10). KHÔNG có model mặc định (chủ dự án chốt 08/11: không mock khi chạy):
 * thiếu tên model → bước chưa cấu hình (`null`), không bao giờ gọi một model giả theo mặc định.
 */
export function loadLlmModel(
  env: Record<string, string | undefined>,
  modelVar: string,
): string | null {
  return env[modelVar]?.trim() || null;
}
