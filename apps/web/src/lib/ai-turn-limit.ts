import { USAGE_MAX_LIMIT } from '@flow/shared';

/**
 * Hạn mức lượt AI/tháng TẠM THỜI (Q-UMU1): bảng gói cước (`PLANS-SCHEMA`, cần migration) chưa có nên đọc từ biến
 * môi trường `AI_TURNS_PLAN_LIMIT`. Giá trị thiếu/sai → mặc định (không đoán số lạ). Thay bằng gói thật khi có.
 */
export const DEFAULT_AI_TURN_LIMIT = 500;

export function resolveAiTurnLimit(source: Record<string, string | undefined>): number {
  const raw = source.AI_TURNS_PLAN_LIMIT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_AI_TURN_LIMIT;
  const value = Number(raw);
  return value <= USAGE_MAX_LIMIT ? value : DEFAULT_AI_TURN_LIMIT;
}
