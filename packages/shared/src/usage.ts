import { z } from 'zod';
import { AppError } from './errors';

/**
 * Hạn mức và đồng hồ lượt (FR-090, BR-03/BR-06, docs/10 §3.6): phần THUẦN, không chạm DB. Bộ đếm thật nằm ở
 * `core.usage_counters` (migration 0039) và chỉ ghi qua hàm DB nguyên tử `core.consume_usage`.
 */

/** Sản phẩm dùng chung `saas-core` (docs/09 §3.1). */
export const USAGE_PRODUCTS = ['commentflow', 'excelflow'] as const;
export type UsageProduct = (typeof USAGE_PRODUCTS)[number];

/** Cảnh báo từ 80% hạn mức (BR-06); chặn ở 100%. Tính bằng số nguyên, không làm tròn. */
export const USAGE_WARN_PERCENT = 80;
/** Trần một lần trừ và trần hạn mức: chặn giá trị vô lý/tràn số (cột DB là integer). */
export const USAGE_MAX_AMOUNT = 1000;
export const USAGE_MAX_LIMIT = 1_000_000_000;

export type UsageLevel = 'ok' | 'warning' | 'blocked';

export type UsageCounts = {
  used: number;
  /** Hạn mức theo gói của kỳ. */
  limit: number;
  /** Lượt mua thêm (cộng vào hạn mức). */
  addon?: number;
};

export type UsageStatus = {
  /** Tổng lượt được dùng trong kỳ = hạn mức + mua thêm. */
  capacity: number;
  remaining: number;
  /** 0–100, làm tròn xuống; 100 khi hết hoặc không có hạn mức. */
  percent: number;
  level: UsageLevel;
};

/** Trạng thái đồng hồ lượt của một kỳ. Hết lượt (kể cả hạn mức 0) = `blocked`. */
export function usageStatus({ used, limit, addon = 0 }: UsageCounts): UsageStatus {
  const capacity = limit + addon;
  const remaining = Math.max(capacity - used, 0);
  if (remaining === 0) return { capacity, remaining, percent: 100, level: 'blocked' };
  const percent = Math.floor((used * 100) / capacity);
  const level = used * 100 >= USAGE_WARN_PERCENT * capacity ? 'warning' : 'ok';
  return { capacity, remaining, percent, level };
}

/** Còn đủ `amount` lượt không? Số lượng không phải số nguyên dương thì không bao giờ được phép. */
export function canConsume(counts: UsageCounts, amount: number): boolean {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  return usageStatus(counts).remaining >= amount;
}

/**
 * Ngày đầu của kỳ (tháng dương lịch theo múi giờ workspace), dạng `YYYY-MM-01` cho cột `period_start date`.
 * Múi giờ lạ hoặc thời điểm không hợp lệ → `AppError` (không đoán).
 */
export function usagePeriodStart(now: Date, timeZone: string): string {
  if (Number.isNaN(now.getTime())) {
    throw new AppError('VALIDATION_FAILED', 'Thời điểm không hợp lệ để tính kỳ hạn mức.');
  }
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
  } catch (cause) {
    throw new AppError('VALIDATION_FAILED', 'Múi giờ không hợp lệ để tính kỳ hạn mức.', { cause });
  }
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}-01`;
}

const consumeInputSchema = z.object({
  product: z.enum(USAGE_PRODUCTS),
  /** Mã đồng hồ do sản phẩm khai báo (CommentFlow: `ai_turns`). */
  meter: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  amount: z.number().int().min(1).max(USAGE_MAX_AMOUNT).default(1),
  limit: z.number().int().min(0).max(USAGE_MAX_LIMIT),
});
export type ConsumeInput = z.output<typeof consumeInputSchema>;

/** Kiểm đầu vào trừ lượt ở ranh giới; lỗi không chép giá trị đầu vào. */
export function parseConsumeInput(input: unknown): ConsumeInput {
  const parsed = consumeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Đầu vào trừ lượt AI không hợp lệ.');
  }
  return parsed.data;
}
