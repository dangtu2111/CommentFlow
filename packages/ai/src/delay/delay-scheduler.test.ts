import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInMemoryAutoSendDelayScheduler } from './delay-scheduler';

function setup() {
  let now = 5_000_000;
  const scheduler = createInMemoryAutoSendDelayScheduler(() => now);
  return {
    scheduler,
    tick: (ms: number) => {
      now += ms;
    },
  };
}
const job = (ws: string, draft: string, delaySeconds = 60) => ({
  workspaceId: ws,
  targetId: `c-${draft}`,
  draftId: draft,
  delaySeconds,
});

describe('FR-071 AutoSendDelayScheduler', () => {
  it('giao câu đến hạn đúng một lần', async () => {
    const { scheduler, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    expect(await scheduler.claimDue()).toEqual([]);
    tick(60_000);
    const first = await scheduler.claimDue();
    expect(first.map((t) => t.draftId)).toEqual(['d1']);
    expect(await scheduler.claimDue()).toEqual([]);
  });

  it('trễ 0 giây giao ngay ở lần claim đầu', async () => {
    const { scheduler } = setup();
    await scheduler.schedule(job('a', 'd1', 0));
    expect((await scheduler.claimDue()).length).toBe(1);
  });

  it('US-042 hủy trong lúc chờ → không bao giờ giao', async () => {
    const { scheduler, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    tick(10_000);
    expect(await scheduler.cancel('a', 'd1', 'staff_cancel')).toMatchObject({
      ok: true,
      next: 'hold_review',
    });
    tick(10 ** 7);
    expect(await scheduler.claimDue()).toEqual([]);
  });

  it('hủy câu không có / của workspace khác → not_found', async () => {
    const { scheduler } = setup();
    await scheduler.schedule(job('a', 'd1'));
    expect(await scheduler.cancel('b', 'd1', 'staff_cancel')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await scheduler.cancel('a', 'zzz', 'staff_cancel')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('hẹn lại cùng (workspace, draft) → duplicate, không kéo dài giờ', async () => {
    const { scheduler } = setup();
    await scheduler.schedule(job('a', 'd1'));
    expect(await scheduler.schedule(job('a', 'd1', 300))).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('cùng draftId ở hai workspace là hai câu khác nhau', async () => {
    const { scheduler } = setup();
    expect((await scheduler.schedule(job('a', 'd1'))).ok).toBe(true);
    expect((await scheduler.schedule(job('b', 'd1'))).ok).toBe(true);
  });

  it('đầu vào hỏng → invalid_input', async () => {
    const { scheduler } = setup();
    expect(await scheduler.schedule(job('a', 'd1', 45))).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
  });

  it('Dừng khẩn cấp hủy mọi câu chờ (kể cả đã đến hạn chưa giao) của đúng workspace', async () => {
    const { scheduler, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    await scheduler.schedule(job('a', 'd2', 300));
    await scheduler.schedule(job('b', 'd3'));
    tick(90_000);
    expect(await scheduler.cancelAllForWorkspace('a', 'emergency_stop')).toEqual({ cancelled: 2 });
    tick(10 ** 7);
    expect((await scheduler.claimDue()).map((t) => t.draftId)).toEqual(['d3']);
  });

  it('cancelAllForWorkspace chỉ nhận lý do hệ thống', async () => {
    const { scheduler } = setup();
    await scheduler.schedule(job('a', 'd1'));
    await expect(scheduler.cancelAllForWorkspace('a', 'staff_cancel' as never)).rejects.toThrow();
  });

  it('property: mỗi câu giao tối đa một lần và không giao câu đã hủy', async () => {
    const op = fc.oneof(
      fc.record({
        k: fc.constant('add' as const),
        d: fc.integer({ min: 0, max: 5 }),
        s: fc.constantFrom(0, 60, 120, 300),
      }),
      fc.record({ k: fc.constant('cancel' as const), d: fc.integer({ min: 0, max: 5 }) }),
      fc.record({ k: fc.constant('tick' as const), ms: fc.integer({ min: 0, max: 200_000 }) }),
      fc.record({ k: fc.constant('claim' as const) }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(op, { maxLength: 40 }), async (ops) => {
        const { scheduler, tick } = setup();
        const cancelled = new Set<string>();
        const delivered: string[] = [];
        for (const o of ops) {
          if (o.k === 'add') await scheduler.schedule(job('a', `d${o.d}`, o.s));
          else if (o.k === 'cancel') {
            const r = await scheduler.cancel('a', `d${o.d}`, 'staff_cancel');
            if (r.ok) cancelled.add(`d${o.d}`);
          } else if (o.k === 'tick') tick(o.ms);
          else delivered.push(...(await scheduler.claimDue()).map((t) => t.draftId));
        }
        expect(new Set(delivered).size).toBe(delivered.length);
        for (const d of delivered) expect(cancelled.has(d)).toBe(false);
      }),
    );
  });
});
