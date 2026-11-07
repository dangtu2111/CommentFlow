import { USAGE_MAX_LIMIT } from './usage';

/**
 * Hạn mức lượt AI/tháng TẠM THỜI (Q-UMU1): bảng gói cước (`PLANS-SCHEMA`, cần migration) chưa có nên đọc từ biến
 * môi trường `AI_TURNS_PLAN_LIMIT`. Giá trị thiếu/sai → mặc định (không đoán số lạ). Thay bằng gói thật khi có.
 * Dùng chung cho web (đồng hồ ở Cài đặt) và worker (cổng trừ lượt của job `pipeline`) để hai nơi không lệch nhau.
 */
export const DEFAULT_AI_TURN_LIMIT = 500;

/** Múi giờ mặc định để tính ranh giới tháng của đồng hồ lượt (chưa đọc `workspaces.timezone` — Q-UMU1). */
export const DEFAULT_USAGE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function resolveAiTurnLimit(source: Record<string, string | undefined>): number {
  const raw = source.AI_TURNS_PLAN_LIMIT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_AI_TURN_LIMIT;
  const value = Number(raw);
  return value <= USAGE_MAX_LIMIT ? value : DEFAULT_AI_TURN_LIMIT;
}
