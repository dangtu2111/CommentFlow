import { describe, expect, it } from 'vitest';
import { cardLinksOfTopic, createRetryThrottle, hasNewCard } from './kb-gaps-links';

describe('cardLinksOfTopic', () => {
  it('shipping → thẻ Ship; policy → Đổi trả/Bảo hành/Thanh toán; chủ đề khác → không có thẻ', () => {
    expect(cardLinksOfTopic('shipping')).toEqual([
      { card: 'ship', href: '/app/kb/policies#policy-card-ship' },
    ]);
    expect(cardLinksOfTopic('policy').map((l) => l.card)).toEqual([
      'returns',
      'warranty',
      'payment',
    ]);
    for (const topic of ['discount', 'product_info', 'order_status', 'size', 'other'] as const) {
      expect(cardLinksOfTopic(topic)).toEqual([]);
    }
  });
});

describe('createRetryThrottle', () => {
  it('1 lần/dòng/phút: lần hai trong phút bị chặn kèm số giây chờ; dòng khác không ảnh hưởng; qua phút thì cho lại', () => {
    const throttle = createRetryThrottle(60_000);
    expect(throttle.take('ws:a', 0)).toEqual({ ok: true });
    expect(throttle.take('ws:a', 20_000)).toEqual({ ok: false, retryAfterSec: 40 });
    expect(throttle.take('ws:b', 20_000)).toEqual({ ok: true });
    expect(throttle.take('ws:a', 60_000)).toEqual({ ok: true });
  });
});

describe('hasNewCard', () => {
  const cards = [
    { kind: 'payment', updatedAt: '2026-11-10T10:00:00.000Z' },
    { kind: 'ship_region', updatedAt: '2026-11-01T10:00:00.000Z' },
  ];
  it('thẻ liên quan cập nhật SAU lastSeenAt → có; trước đó, hoặc thẻ không liên quan chủ đề → không', () => {
    expect(hasNewCard('policy', '2026-11-09T00:00:00.000Z', cards)).toBe(true);
    expect(hasNewCard('policy', '2026-11-11T00:00:00.000Z', cards)).toBe(false);
    expect(hasNewCard('shipping', '2026-11-09T00:00:00.000Z', cards)).toBe(false);
    expect(hasNewCard('size', '2026-01-01T00:00:00.000Z', cards)).toBe(false);
  });
});
