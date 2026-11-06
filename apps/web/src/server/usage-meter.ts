import { createUsageMeter } from '@flow/saas-core';
import { resolveAiTurnLimit } from '../lib/ai-turn-limit';
import { buildUsageMeterView, type UsageMeterView } from '../lib/usage-meter-view';
import { getDb } from './db';

/** Múi giờ mặc định của workspace (`core.workspaces.timezone`); chưa đọc cột thật (Q-UMU1). */
const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Đồng hồ lượt AI của kỳ hiện tại cho workspace đang chọn (FR-090): CHỈ ĐỌC qua `withWorkspace`, không trừ lượt.
 * `workspaceId` lấy từ `requireAppUser`. Lỗi đọc → `null` (thẻ ẩn, không làm hỏng trang Cài đặt).
 */
export async function loadUsageMeterView(workspaceId: string): Promise<UsageMeterView | null> {
  const limit = resolveAiTurnLimit(process.env);
  try {
    const meter = createUsageMeter({ db: getDb(), product: 'commentflow', meter: 'ai_turns' });
    const status = await meter.read(workspaceId, { limit, timeZone: DEFAULT_TIME_ZONE });
    // `read` trả trạng thái đã tính; dựng lại số đếm (đã dùng bị chặn ở hạn mức) để dùng chung một mô hình hiển thị.
    return buildUsageMeterView({
      used: status.capacity - status.remaining,
      limit: status.capacity,
    });
  } catch (error) {
    console.error('usage_meter_read_failed', error instanceof Error ? error.name : 'unknown');
    return null;
  }
}
