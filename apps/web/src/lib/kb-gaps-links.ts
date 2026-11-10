import type { KbGapTopic } from '@flow/shared';

/** Thẻ chính sách của trang `/app/kb/policies` (khớp `POLICY_CARDS` ở `kb-policy-view.ts`). */
export type GapCard = 'ship' | 'returns' | 'warranty' | 'payment';

/** Nút "Điền thẻ": chủ đề lỗ hổng → thẻ chính sách trả lời được. Chủ đề khác (sản phẩm, size, giảm giá…) không có thẻ → chỉ "Viết câu trả lời" (FAQ). */
const CARDS_OF_TOPIC: Partial<Record<KbGapTopic, readonly GapCard[]>> = {
  shipping: ['ship'],
  policy: ['returns', 'warranty', 'payment'],
};

export function cardLinksOfTopic(topic: KbGapTopic): Array<{ card: GapCard; href: string }> {
  return (CARDS_OF_TOPIC[topic] ?? []).map((card) => ({
    card,
    href: `/app/kb/policies#policy-card-${card}`,
  }));
}

/**
 * Giới hạn "Thử lại câu này": mỗi dòng (workspace + gap) tối đa 1 lần/phút, giữ trong bộ nhớ tiến trình (như bộ đếm lượt thử của Thử AI).
 * `take` trả `ok` hoặc số giây phải chờ.
 */
export function createRetryThrottle(windowMs = 60_000) {
  const last = new Map<string, number>();
  return {
    take(key: string, nowMs: number): { ok: true } | { ok: false; retryAfterSec: number } {
      const prev = last.get(key);
      if (prev !== undefined && nowMs - prev < windowMs) {
        return { ok: false, retryAfterSec: Math.ceil((windowMs - (nowMs - prev)) / 1000) };
      }
      last.set(key, nowMs);
      if (last.size > 5000) {
        for (const [k, t] of last) if (nowMs - t >= windowMs) last.delete(k);
      }
      return { ok: true };
    },
  };
}
