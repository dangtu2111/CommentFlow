/**
 * Chính sách thời hạn lưu dữ liệu (RETENTION-JOB, FR-126, Q-RET1): logic thuần, không chạm DB.
 * Hàm SQL `cf.purge_expired_workspace_data` / `cf.compact_ai_usage` (migration 0053) áp cùng quy tắc; các cận dưới
 * ở đây khớp cận dưới trong SQL (chặn gọi nhầm xóa dữ liệu còn trong hạn dùng).
 */

/** Dữ liệu bình luận/nháp AI/khách tiềm năng: giữ 12 tháng (chủ dự án chốt, FR-126). */
export const DATA_RETENTION_DAYS = 365;
/** `ai_usage` chi tiết giữ 90 ngày, sau đó gộp theo ngày vào `ai_usage_daily`. */
export const AI_USAGE_DETAIL_DAYS = 90;
/** Cận dưới (khớp CHECK trong hàm SQL): không cho cấu hình/ gọi nhầm ngắn hơn. */
export const MIN_DATA_RETENTION_DAYS = 180;
export const MIN_AI_USAGE_DETAIL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function assertDays(days: number): void {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError('retention days must be a positive integer');
  }
}

/** Mốc cắt: bản ghi cũ hơn mốc này (nghiêm ngặt) là quá hạn. */
export function retentionCutoff(now: Date, days: number): Date {
  assertDays(days);
  return new Date(now.getTime() - days * DAY_MS);
}

export function isPastRetention(timestamp: Date, now: Date, days: number): boolean {
  return timestamp.getTime() < retentionCutoff(now, days).getTime();
}

export type AiUsageRow = {
  workspaceId: string;
  createdAt: Date;
  step: string;
  model: string;
  promptVersion: string | null;
  cacheHit: boolean;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Chi phí tính bằng micro-USD (số nguyên) để cộng không sai số. */
  costMicroUsd: number;
};

export type AiUsageDailyRow = Omit<AiUsageRow, 'createdAt' | 'promptVersion'> & {
  day: string;
  promptVersion: string;
  calls: number;
};

/** Mô hình tham chiếu của `cf.compact_ai_usage`: gộp theo (workspace, ngày UTC, bước, model, prompt, cache). */
export function compactAiUsageRows(rows: readonly AiUsageRow[]): AiUsageDailyRow[] {
  const groups = new Map<string, AiUsageDailyRow>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const promptVersion = r.promptVersion ?? '';
    const key = [r.workspaceId, day, r.step, r.model, promptVersion, r.cacheHit].join('\u0000');
    const g = groups.get(key);
    if (g) {
      g.calls += 1;
      g.inputTokens += r.inputTokens;
      g.outputTokens += r.outputTokens;
      g.cachedTokens += r.cachedTokens;
      g.costMicroUsd += r.costMicroUsd;
    } else {
      groups.set(key, {
        workspaceId: r.workspaceId,
        day,
        step: r.step,
        model: r.model,
        promptVersion,
        cacheHit: r.cacheHit,
        calls: 1,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cachedTokens: r.cachedTokens,
        costMicroUsd: r.costMicroUsd,
      });
    }
  }
  return [...groups.values()];
}
