import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutoSentRecord } from '../history/auto-sent-record';
import {
  type AbuseInput,
  evaluateAbuse,
  evaluateRemovedAfterSend,
  REMOVED_AFTER_SEND_MIN_SENT,
} from './abuse-signals';

const now = new Date('2026-11-06T12:00:00Z');
const rec = (i: number, workspaceId = 'ws1', wrong = false): AutoSentRecord => ({
  id: `r${i}`,
  workspaceId,
  channelId: 'ch1',
  targetType: 'comment',
  targetId: `c${i}`,
  text: 't',
  lang: 'vi',
  label: 'other',
  confidence: 0.9,
  sentAt: new Date(now.getTime() - 10 * 60_000),
  status: wrong ? 'marked_wrong' : 'sent',
  markedWrongAt: wrong ? now : null,
  markedWrongBy: wrong ? 'u1' : null,
  wrongReason: null,
});
const base = (over: Partial<AbuseInput> = {}): AbuseInput => ({
  workspaceId: 'ws1',
  records: [],
  sendOutcomes: [],
  cost: { spentUsd: 0, capUsd: null },
  spike: { lastHourSent: 0, avgHourlySent7d: 0 },
  removedAfterSend: { sent: 0, removed: 0 },
  scanItems: [],
  ...over,
});

describe('FR-115 evaluateRemovedAfterSend (>20%/24 giờ, ≥10 câu)', () => {
  it('trên 20% và đủ mẫu → cảnh báo', () => {
    expect(evaluateRemovedAfterSend({ sent: 10, removed: 3 }).warn).toBe(true);
  });
  it('đúng 20% → không cảnh báo (so số nguyên)', () => {
    expect(evaluateRemovedAfterSend({ sent: 10, removed: 2 }).warn).toBe(false);
    expect(evaluateRemovedAfterSend({ sent: 15, removed: 3 }).warn).toBe(false);
  });
  it('dưới số mẫu tối thiểu → không cảnh báo', () => {
    const sent = REMOVED_AFTER_SEND_MIN_SENT - 1;
    expect(evaluateRemovedAfterSend({ sent, removed: 9 }).warn).toBe(false);
  });
  it('số liệu hỏng (NaN, âm, không nguyên, removed > sent) → không cảnh báo giả', () => {
    const bads = [
      { sent: Number.NaN, removed: 5 },
      { sent: -10, removed: 5 },
      { sent: 10.5, removed: 5 },
      { sent: 10, removed: 11 },
      { sent: 10, removed: -1 },
    ];
    for (const bad of bads) expect(evaluateRemovedAfterSend(bad).warn).toBe(false);
  });
  it('property: cảnh báo ⇔ sent ≥ 10 và removed*5 > sent (số nguyên hợp lệ)', () => {
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), (sent, removed) => {
        fc.pre(removed <= sent);
        expect(evaluateRemovedAfterSend({ sent, removed }).warn).toBe(
          sent >= REMOVED_AFTER_SEND_MIN_SENT && removed * 5 > sent,
        );
      }),
    );
  });
});

describe('FR-115 evaluateAbuse', () => {
  it('không có gì bất thường → không hành động', () => {
    const d = evaluateAbuse(base(), now);
    expect(d.autoPause.pauseWorkspace).toBeNull();
    expect(d.warnAdmin).toEqual([]);
    expect(d.blockAutoSend).toBe(false);
    expect(d.reviewItems).toEqual([]);
    expect(d.signals).toEqual([]);
  });
  it('Đánh dấu sai >10% → dừng workspace + tín hiệu marked_wrong_rate', () => {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => rec(i)),
      rec(8, 'ws1', true),
      rec(9, 'ws1', true),
    ];
    const d = evaluateAbuse(base({ records }), now);
    expect(d.autoPause.pauseWorkspace?.reason).toBe('marked_wrong_rate');
    expect(d.signals.map((s) => s.signal)).toContain('marked_wrong_rate');
  });
  it('bản ghi của workspace khác bị loại (không dừng nhầm workspace này)', () => {
    const records = Array.from({ length: 12 }, (_, i) => rec(i, 'ws-khac', true));
    expect(evaluateAbuse(base({ records }), now).autoPause.pauseWorkspace).toBeNull();
  });
  it('kết quả gửi của workspace khác bị loại', () => {
    const sendOutcomes = Array.from({ length: 6 }, (_, i) => ({
      workspaceId: 'ws-khac',
      channelId: 'x',
      at: new Date(now.getTime() - i * 1000),
      ok: false,
    }));
    expect(evaluateAbuse(base({ sendOutcomes }), now).autoPause.pauseWorkspace).toBeNull();
  });
  it('lỗi 368 → khóa kênh + tín hiệu graph_368 theo kênh, không dừng workspace', () => {
    const sendOutcomes = [
      {
        workspaceId: 'ws1',
        channelId: 'ch9',
        at: new Date(now.getTime() - 1000),
        ok: false,
        blockError: 'graph_368' as const,
      },
    ];
    const d = evaluateAbuse(base({ sendOutcomes }), now);
    expect(d.autoPause.suspendChannels.map((c) => c.channelId)).toEqual(['ch9']);
    expect(d.autoPause.pauseWorkspace).toBeNull();
    expect(d.signals).toContainEqual({ signal: 'graph_368', channelId: 'ch9' });
  });
  it('spike → send_spike; câu bị xóa >20% → removed_after_send; không dừng', () => {
    const d = evaluateAbuse(
      base({
        spike: { lastHourSent: 30, avgHourlySent7d: 2 },
        removedAfterSend: { sent: 20, removed: 5 },
      }),
      now,
    );
    expect(d.warnAdmin).toEqual(['send_spike', 'removed_after_send']);
    expect(d.autoPause.pauseWorkspace).toBeNull();
    expect(d.autoPause.halveRateLimit).toBe(true);
  });
  it('từ khóa cấm → chặn tự gửi + hàng xem xét (không chứa nội dung), không dừng workspace', () => {
    const d = evaluateAbuse(
      base({ scanItems: [{ id: 'kb1', text: 'Nhận vay tiền nhanh lãi thấp' }] }),
      now,
    );
    expect(d.blockAutoSend).toBe(true);
    expect(d.reviewItems).toEqual([{ id: 'kb1', keyword: 'vay tiền' }]);
    expect(d.signals).toContainEqual({ signal: 'banned_keyword', channelId: null });
    expect(d.autoPause.pauseWorkspace).toBeNull();
    expect(JSON.stringify(d)).not.toContain('lãi thấp');
  });
  it('property: quyết định KHÔNG BAO GIỜ có hành động ẩn bình luận', () => {
    fc.assert(
      fc.property(fc.nat(40), fc.nat(40), fc.string(), fc.boolean(), (hour, removed, text, bad) => {
        const d = evaluateAbuse(
          base({
            spike: { lastHourSent: hour, avgHourlySent7d: 1 },
            removedAfterSend: { sent: 40, removed },
            scanItems: [{ id: 'a', text }],
            sendOutcomes: bad
              ? [
                  {
                    workspaceId: 'ws1',
                    channelId: 'c',
                    at: now,
                    ok: false,
                    blockError: 'policy_error',
                  },
                ]
              : [],
          }),
          now,
        );
        expect(JSON.stringify(d)).not.toMatch(/hide|hidden|ẩn/i);
        expect(Object.keys(d).sort()).toEqual(
          ['autoPause', 'blockAutoSend', 'reviewItems', 'signals', 'warnAdmin'].sort(),
        );
      }),
    );
  });
});
