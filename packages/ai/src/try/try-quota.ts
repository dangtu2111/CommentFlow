/**
 * Giới hạn lượt "Thử AI" mỗi ngày (BR-03): tách khỏi hạn mức gói, KHÔNG gọi `usageMeter.consume`.
 * Bản trong bộ nhớ (Q-ATB1): mất khi khởi động lại, mỗi instance một bộ; bản bền chờ `TRY-AI-REAL`.
 */
export const DEFAULT_TRY_DAILY_LIMIT = 30;

export type TryQuotaResult = { ok: boolean; used: number; limit: number };

export interface TryQuota {
  /** Ghi nhận một lượt nếu còn; lượt bị chặn KHÔNG được ghi nhận. */
  take(workspaceId: string, now: Date): TryQuotaResult;
  size(): number;
}

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

export function createTryQuota(options: { limit?: number } = {}): TryQuota {
  const requested = options.limit;
  const limit =
    requested !== undefined && Number.isInteger(requested) && requested > 0
      ? requested
      : DEFAULT_TRY_DAILY_LIMIT;
  const counts = new Map<string, number>();
  let currentDay = '';

  return {
    take(workspaceId, now) {
      const day = dayKey(now);
      if (day !== currentDay) {
        counts.clear();
        currentDay = day;
      }
      const used = counts.get(workspaceId) ?? 0;
      if (used >= limit) return { ok: false, used, limit };
      counts.set(workspaceId, used + 1);
      return { ok: true, used: used + 1, limit };
    },
    size: () => counts.size,
  };
}
