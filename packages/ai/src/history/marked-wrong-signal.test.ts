import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutoSentRecord } from './auto-sent-record';
import { evaluateMarkedWrongSignal } from './marked-wrong-signal';

const now = new Date('2026-11-06T12:00:00Z');
const mk = (i: number, minutesAgo: number, wrong: boolean): AutoSentRecord => ({
  id: `r${i}`,
  workspaceId: 'ws1',
  channelId: 'ch1',
  targetType: 'comment',
  targetId: `c${i}`,
  text: 't',
  lang: 'vi',
  label: 'other',
  confidence: 0.9,
  sentAt: new Date(now.getTime() - minutesAgo * 60_000),
  status: wrong ? 'marked_wrong' : 'sent',
  markedWrongAt: wrong ? now : null,
  markedWrongBy: wrong ? 'u1' : null,
  wrongReason: null,
});
const batch = (total: number, wrong: number, minutesAgo = 10) =>
  Array.from({ length: total }, (_, i) => mk(i, minutesAgo, i < wrong));

describe('FR-075 tín hiệu tỷ lệ Đánh dấu sai (docs/09 §11.2)', () => {
  it('> 10% và ≥ 10 câu trong 1 giờ → pause', () => {
    expect(evaluateMarkedWrongSignal(batch(10, 2), now)).toMatchObject({
      pause: true,
      sent: 10,
      wrong: 2,
    });
  });

  it('đúng 10% → không pause (ngưỡng là lớn hơn hẳn)', () => {
    expect(evaluateMarkedWrongSignal(batch(10, 1), now).pause).toBe(false);
  });

  it('dưới 10 câu → không pause dù tỷ lệ cao', () => {
    expect(evaluateMarkedWrongSignal(batch(9, 9), now).pause).toBe(false);
  });

  it('chỉ tính câu gửi trong 1 giờ gần nhất (đúng 60 phút còn tính, 61 phút thì không)', () => {
    expect(evaluateMarkedWrongSignal(batch(10, 5, 60), now).sent).toBe(10);
    expect(evaluateMarkedWrongSignal(batch(10, 5, 61), now).sent).toBe(0);
  });

  it('không có câu nào → tỷ lệ 0, không pause', () => {
    expect(evaluateMarkedWrongSignal([], now)).toEqual({
      pause: false,
      sent: 0,
      wrong: 0,
      rate: 0,
    });
  });

  it('property: pause ⇔ sent ≥ 10 và wrong/sent > 0,1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }), (total, w) => {
        const wrong = Math.min(w, total);
        const r = evaluateMarkedWrongSignal(batch(total, wrong), now);
        expect(r.pause).toBe(total >= 10 && wrong * 10 > total);
      }),
    );
  });
});
