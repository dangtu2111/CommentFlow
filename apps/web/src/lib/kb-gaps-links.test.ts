import { describe, expect, it } from 'vitest';
import { cardLinksOfTopic, createRetryThrottle } from './kb-gaps-links';

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
