import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutoSentRecord } from '../history/auto-sent-record';
import {
  AUTO_PAUSE_DEFAULTS,
  type AutoPauseInput,
  CHANNEL_SUSPEND_MS,
  evaluateAutoPause,
  type SendOutcome,
} from './auto-pause';

const now = new Date('2026-11-06T12:00:00Z');
const rec = (i: number, wrong: boolean): AutoSentRecord => ({
  id: `r${i}`,
  workspaceId: 'ws1',
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
const records = (total: number, wrong: number) =>
  Array.from({ length: total }, (_, i) => rec(i, i < wrong));
const out = (minAgo: number, ok: boolean, extra: Partial<SendOutcome> = {}): SendOutcome => ({
  channelId: 'ch1',
  at: new Date(now.getTime() - minAgo * 60_000),
  ok,
  ...extra,
});
const base = (over: Partial<AutoPauseInput> = {}): AutoPauseInput => ({
  records: [],
  sendOutcomes: [],
  cost: { spentUsd: 0, capUsd: null },
  spike: { lastHourSent: 0, avgHourlySent7d: 0 },
  ...over,
});

describe('FR-073 FR-115 US-044 evaluateAutoPause', () => {
  it('không tín hiệu → không làm gì', () => {
    expect(evaluateAutoPause(base(), now)).toMatchObject({
      pauseWorkspace: null,
      suspendChannels: [],
      warnAdmin: [],
      halveRateLimit: false,
    });
  });

  it('tỷ lệ Đánh dấu sai > 10% và ≥ 10 câu → tạm dừng workspace', () => {
    const d = evaluateAutoPause(base({ records: records(10, 2) }), now);
    expect(d.pauseWorkspace?.reason).toBe('marked_wrong_rate');
  });
  it('đúng 10% hoặc dưới 10 câu → không dừng', () => {
    expect(evaluateAutoPause(base({ records: records(10, 1) }), now).pauseWorkspace).toBeNull();
    expect(evaluateAutoPause(base({ records: records(9, 9) }), now).pauseWorkspace).toBeNull();
  });

  it('gửi lỗi liên tiếp ≥ ngưỡng (mặc định 5) → tạm dừng', () => {
    const fails = [1, 2, 3, 4, 5].map((m) => out(m, false));
    expect(evaluateAutoPause(base({ sendOutcomes: fails }), now).pauseWorkspace?.reason).toBe(
      'consecutive_send_failures',
    );
  });
  it('một lần gửi thành công xen giữa cắt chuỗi lỗi (tính từ mới nhất về cũ)', () => {
    const seq = [out(1, false), out(2, false), out(3, true), out(4, false), out(5, false)];
    const small = { ...AUTO_PAUSE_DEFAULTS, maxConsecutiveSendFailures: 3 };
    expect(evaluateAutoPause(base({ sendOutcomes: seq, config: small }), now).pauseWorkspace).toBe(
      null,
    );
  });
  it('thứ tự mảng đầu vào không ảnh hưởng', () => {
    const seq = [5, 4, 3, 2, 1].map((m) => out(m, false));
    expect(evaluateAutoPause(base({ sendOutcomes: seq }), now).pauseWorkspace?.reason).toBe(
      'consecutive_send_failures',
    );
  });
  it('ngưỡng cấu hình hỏng (0, âm, NaN, thập phân) → dùng mặc định', () => {
    const fails = [1, 2, 3, 4].map((m) => out(m, false));
    for (const bad of [0, -1, Number.NaN, 2.5]) {
      const cfg = { maxConsecutiveSendFailures: bad };
      expect(
        evaluateAutoPause(base({ sendOutcomes: fails, config: cfg }), now).pauseWorkspace,
      ).toBe(null);
    }
  });

  it('lỗi 368/chính sách → tạm khóa KÊNH 24 giờ, không dừng cả workspace', () => {
    const d = evaluateAutoPause(
      base({ sendOutcomes: [out(1, false, { blockError: 'graph_368' })] }),
      now,
    );
    expect(d.pauseWorkspace).toBeNull();
    expect(d.suspendChannels).toEqual([
      {
        channelId: 'ch1',
        reason: 'graph_368',
        until: new Date(now.getTime() - 60_000 + CHANNEL_SUSPEND_MS),
      },
    ]);
  });
  it('hạn khóa tính từ lần lỗi, chạy lại 15 phút sau không kéo dài hạn', () => {
    const o = [out(1, false, { blockError: 'graph_368' })];
    const first = evaluateAutoPause(base({ sendOutcomes: o }), now).suspendChannels[0]?.until;
    const later = new Date(now.getTime() + 15 * 60_000);
    const second = evaluateAutoPause(base({ sendOutcomes: o }), later).suspendChannels[0]?.until;
    expect(second).toEqual(first);
  });
  it('số liệu chi phí hỏng khi đã đặt hạn mức → coi là chạm trần', () => {
    for (const spentUsd of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(
        evaluateAutoPause(base({ cost: { spentUsd, capUsd: 50 } }), now).pauseWorkspace?.reason,
      ).toBe('cost_cap_reached');
    }
    expect(
      evaluateAutoPause(base({ cost: { spentUsd: Number.NaN, capUsd: null } }), now).pauseWorkspace,
    ).toBeNull();
  });
  it('lỗi 368 cũ hơn 24 giờ không khóa lại; mỗi kênh một mục', () => {
    const old = out(24 * 60 + 1, false, { blockError: 'graph_368' });
    expect(evaluateAutoPause(base({ sendOutcomes: [old] }), now).suspendChannels).toEqual([]);
    const two = [
      out(1, false, { blockError: 'graph_368' }),
      out(2, false, { blockError: 'policy_error' }),
      out(3, false, { channelId: 'ch2', blockError: 'policy_error' }),
    ];
    const s = evaluateAutoPause(base({ sendOutcomes: two }), now).suspendChannels;
    expect(s.map((x) => x.channelId).sort()).toEqual(['ch1', 'ch2']);
  });
  it('lỗi chặn không tính vào chuỗi lỗi liên tiếp', () => {
    const blocks = [1, 2, 3, 4, 5].map((m) => out(m, false, { blockError: 'graph_368' }));
    expect(evaluateAutoPause(base({ sendOutcomes: blocks }), now).pauseWorkspace).toBeNull();
  });

  it('chi phí chạm 100% hạn mức → tạm dừng; chưa đặt hạn mức/chưa chạm → không', () => {
    const hit = evaluateAutoPause(base({ cost: { spentUsd: 50, capUsd: 50 } }), now);
    expect(hit.pauseWorkspace?.reason).toBe('cost_cap_reached');
    expect(
      evaluateAutoPause(base({ cost: { spentUsd: 49.99, capUsd: 50 } }), now).pauseWorkspace,
    ).toBeNull();
    expect(
      evaluateAutoPause(base({ cost: { spentUsd: 1e6, capUsd: null } }), now).pauseWorkspace,
    ).toBeNull();
  });

  it('tăng đột biến > 5× trung bình 7 ngày (và ≥ 20 câu) → cảnh báo Admin + giảm nửa tốc độ, KHÔNG dừng', () => {
    const d = evaluateAutoPause(base({ spike: { lastHourSent: 60, avgHourlySent7d: 10 } }), now);
    expect(d.warnAdmin).toEqual(['send_spike']);
    expect(d.halveRateLimit).toBe(true);
    expect(d.pauseWorkspace).toBeNull();
  });
  it('đúng 5× hoặc dưới 20 câu → không phải đột biến', () => {
    expect(
      evaluateAutoPause(base({ spike: { lastHourSent: 50, avgHourlySent7d: 10 } }), now).warnAdmin,
    ).toEqual([]);
    expect(
      evaluateAutoPause(base({ spike: { lastHourSent: 19, avgHourlySent7d: 0 } }), now).warnAdmin,
    ).toEqual([]);
    expect(
      evaluateAutoPause(base({ spike: { lastHourSent: 20, avgHourlySent7d: 0 } }), now).warnAdmin,
    ).toEqual(['send_spike']);
  });

  it('nhiều lý do cùng lúc: giữ lý do ưu tiên cao nhất + liệt kê đủ', () => {
    const d = evaluateAutoPause(
      base({
        records: records(10, 5),
        sendOutcomes: [1, 2, 3, 4, 5].map((m) => out(m, false)),
        cost: { spentUsd: 9, capUsd: 5 },
      }),
      now,
    );
    expect(d.pauseWorkspace?.reason).toBe('cost_cap_reached');
    expect(d.pauseWorkspace?.reasons).toEqual([
      'cost_cap_reached',
      'marked_wrong_rate',
      'consecutive_send_failures',
    ]);
  });

  it('property: không có lỗi/sai/chi phí thì không bao giờ dừng workspace', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (sent, last, avg) => {
          const d = evaluateAutoPause(
            base({
              records: records(sent, 0),
              sendOutcomes: Array.from({ length: sent }, (_, i) => out(i, true)),
              spike: { lastHourSent: last, avgHourlySent7d: avg },
            }),
            now,
          );
          return d.pauseWorkspace === null;
        },
      ),
    );
  });
  it('property: ≥ N lỗi mới nhất liên tiếp (N hợp lệ) ⇔ dừng vì lỗi gửi', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.boolean(), { maxLength: 20 }),
        (n, oks) => {
          const seq = oks.map((ok, i) => out(i + 1, ok)); // i nhỏ = mới hơn
          let streak = 0;
          for (const o of seq) {
            if (o.ok) break;
            streak += 1;
          }
          const d = evaluateAutoPause(
            base({ sendOutcomes: seq, config: { maxConsecutiveSendFailures: n } }),
            now,
          );
          return (d.pauseWorkspace !== null) === streak >= n;
        },
      ),
    );
  });
});
