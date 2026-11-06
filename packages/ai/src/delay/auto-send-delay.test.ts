import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type AutoSendTimer,
  cancelAutoSendTimer,
  dispatchAutoSendTimer,
  planAutoSendDelay,
  resolveAutoSendTimer,
} from './auto-send-delay';

const WS = 'ws-a';
const NOW = 1_000_000;
const base = { workspaceId: WS, targetId: 'cmt-1', draftId: 'drf-1', nowMs: NOW };

function plan(delaySeconds: number): AutoSendTimer {
  const r = planAutoSendDelay({ ...base, delaySeconds });
  if (!r.ok) throw new Error('plan failed');
  return r.timer;
}

describe('FR-071 planAutoSendDelay', () => {
  it.each([0, 60, 120, 300])('nhận trễ %i giây, runAt = now + trễ', (s) => {
    const t = plan(s);
    expect(t.runAt).toBe(NOW + s * 1000);
    expect(t.status).toBe('pending');
    expect(t.workspaceId).toBe(WS);
  });

  it.each([-1, 30, 301, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('từ chối trễ %s', (s) => {
    expect(planAutoSendDelay({ ...base, delaySeconds: s })).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
  });

  it('từ chối id rỗng hoặc mốc thời gian hỏng, không ném', () => {
    expect(planAutoSendDelay({ ...base, delaySeconds: 60, workspaceId: '' }).ok).toBe(false);
    expect(planAutoSendDelay({ ...base, delaySeconds: 60, draftId: ' ' }).ok).toBe(false);
    expect(planAutoSendDelay({ ...base, delaySeconds: 60, nowMs: Number.NaN }).ok).toBe(false);
  });
});

describe('US-042 cancelAutoSendTimer', () => {
  it('Staff hủy khi còn chờ → hủy, câu về chờ duyệt', () => {
    const r = cancelAutoSendTimer(plan(60), {
      workspaceId: WS,
      reason: 'staff_cancel',
      nowMs: NOW + 59_999,
    });
    expect(r).toMatchObject({ ok: true, next: 'hold_review' });
    if (r.ok) expect(r.timer.status).toBe('cancelled');
  });

  it('Sửa trong lúc chờ → hủy tự gửi, mở ô sửa', () => {
    const r = cancelAutoSendTimer(plan(60), { workspaceId: WS, reason: 'staff_edit', nowMs: NOW });
    expect(r).toMatchObject({ ok: true, next: 'edit' });
  });

  it('đúng lúc runAt Staff không còn hủy được (too_late)', () => {
    expect(
      cancelAutoSendTimer(plan(60), {
        workspaceId: WS,
        reason: 'staff_cancel',
        nowMs: NOW + 60_000,
      }),
    ).toEqual({ ok: false, reason: 'too_late' });
  });

  it('trễ 0 giây: không có cửa sổ hủy cho Staff', () => {
    expect(
      cancelAutoSendTimer(plan(0), { workspaceId: WS, reason: 'staff_cancel', nowMs: NOW }),
    ).toEqual({ ok: false, reason: 'too_late' });
  });

  it('Dừng khẩn cấp / AI tạm dừng hủy được cả khi đã đến hạn nhưng chưa giao', () => {
    for (const reason of ['emergency_stop', 'ai_paused'] as const) {
      const r = cancelAutoSendTimer(plan(60), { workspaceId: WS, reason, nowMs: NOW + 120_000 });
      expect(r).toMatchObject({ ok: true, next: 'hold_review' });
    }
  });

  it('hủy hai lần → already_cancelled; đã giao → already_dispatched', () => {
    const t = plan(60);
    const c = cancelAutoSendTimer(t, { workspaceId: WS, reason: 'staff_cancel', nowMs: NOW });
    if (!c.ok) throw new Error('x');
    expect(
      cancelAutoSendTimer(c.timer, { workspaceId: WS, reason: 'emergency_stop', nowMs: NOW }),
    ).toEqual({ ok: false, reason: 'already_cancelled' });
    const d = dispatchAutoSendTimer(t, NOW + 60_000);
    if (!d.ok) throw new Error('y');
    expect(
      cancelAutoSendTimer(d.timer, {
        workspaceId: WS,
        reason: 'emergency_stop',
        nowMs: NOW + 61_000,
      }),
    ).toEqual({ ok: false, reason: 'already_dispatched' });
  });

  it('chéo workspace → not_found (không lộ tồn tại)', () => {
    expect(
      cancelAutoSendTimer(plan(60), { workspaceId: 'ws-b', reason: 'staff_cancel', nowMs: NOW }),
    ).toEqual({ ok: false, reason: 'not_found' });
  });

  it('lý do lạ / mốc thời gian hỏng → invalid_input, không ném', () => {
    expect(
      cancelAutoSendTimer(plan(60), { workspaceId: WS, reason: 'x' as never, nowMs: NOW }),
    ).toEqual({ ok: false, reason: 'invalid_input' });
    expect(
      cancelAutoSendTimer(plan(60), {
        workspaceId: WS,
        reason: 'staff_cancel',
        nowMs: Number.NaN,
      }),
    ).toEqual({ ok: false, reason: 'invalid_input' });
  });
});

describe('FR-071 resolve / dispatch', () => {
  it('wait → due → dispatched; không giao trước runAt', () => {
    const t = plan(120);
    expect(resolveAutoSendTimer(t, NOW + 1000)).toEqual({ state: 'wait', remainingMs: 119_000 });
    expect(dispatchAutoSendTimer(t, NOW + 119_999)).toEqual({ ok: false, reason: 'not_due' });
    expect(resolveAutoSendTimer(t, NOW + 120_000)).toEqual({ state: 'due' });
    const d = dispatchAutoSendTimer(t, NOW + 120_000);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(resolveAutoSendTimer(d.timer, NOW + 999_999)).toEqual({ state: 'dispatched' });
      expect(dispatchAutoSendTimer(d.timer, NOW + 999_999)).toEqual({
        ok: false,
        reason: 'already_dispatched',
      });
    }
  });

  it('câu đã hủy không bao giờ giao', () => {
    const c = cancelAutoSendTimer(plan(60), {
      workspaceId: WS,
      reason: 'staff_cancel',
      nowMs: NOW,
    });
    if (!c.ok) throw new Error('x');
    expect(resolveAutoSendTimer(c.timer, NOW + 10 ** 9)).toEqual({ state: 'cancelled' });
    expect(dispatchAutoSendTimer(c.timer, NOW + 10 ** 9)).toEqual({
      ok: false,
      reason: 'cancelled',
    });
  });

  it('mốc thời gian hỏng khi giao → không giao', () => {
    expect(dispatchAutoSendTimer(plan(0), Number.NaN)).toEqual({ ok: false, reason: 'not_due' });
    expect(resolveAutoSendTimer(plan(0), Number.NaN)).toMatchObject({ state: 'wait' });
  });
});

describe('FR-071 dữ liệu hẹn giờ đọc từ nơi lưu bị hỏng', () => {
  it('runAt hỏng hoặc trạng thái lạ → không giao, coi như còn chờ', () => {
    const t = plan(60);
    const bad = [
      { ...t, runAt: Number.NaN },
      { ...t, runAt: undefined as never },
      { ...t, runAt: null as never },
      { ...t, status: 'weird' as never },
    ];
    for (const b of bad) {
      expect(dispatchAutoSendTimer(b, NOW + 10 ** 9)).toEqual({ ok: false, reason: 'not_due' });
      expect(resolveAutoSendTimer(b, NOW + 10 ** 9)).toEqual({
        state: 'wait',
        remainingMs: 60_000,
      });
    }
    expect(resolveAutoSendTimer({ ...t, delaySeconds: 7, runAt: Number.NaN }, NOW)).toEqual({
      state: 'wait',
      remainingMs: 0,
    });
  });
});

describe('FR-071 US-042 property-based', () => {
  const action = fc.oneof(
    fc.record({ kind: fc.constant('advance' as const), ms: fc.integer({ min: 0, max: 400_000 }) }),
    fc.record({
      kind: fc.constant('cancel' as const),
      reason: fc.constantFrom('staff_cancel', 'staff_edit', 'emergency_stop', 'ai_paused'),
    }),
    fc.record({ kind: fc.constant('dispatch' as const) }),
  );

  it('đã giao ⇒ chưa từng hủy và không trước runAt; đã hủy thì không giao', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 60, 120, 300),
        fc.array(action, { maxLength: 30 }),
        (delay, actions) => {
          let t = plan(delay);
          let now = NOW;
          let everCancelled = false;
          let dispatchedAt: number | null = null;
          for (const a of actions) {
            if (a.kind === 'advance') now += a.ms;
            else if (a.kind === 'cancel') {
              const r = cancelAutoSendTimer(t, { workspaceId: WS, reason: a.reason, nowMs: now });
              if (r.ok) {
                t = r.timer;
                everCancelled = true;
              }
            } else {
              const r = dispatchAutoSendTimer(t, now);
              if (r.ok) {
                t = r.timer;
                dispatchedAt = now;
              }
            }
          }
          if (dispatchedAt !== null) {
            expect(everCancelled).toBe(false);
            expect(dispatchedAt).toBeGreaterThanOrEqual(t.runAt);
          }
          if (everCancelled) expect(t.status).toBe('cancelled');
        },
      ),
    );
  });
});
