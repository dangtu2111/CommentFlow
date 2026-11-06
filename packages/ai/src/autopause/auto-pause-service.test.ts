import { describe, expect, it } from 'vitest';
import { createInMemoryAutoSendDelayScheduler } from '../delay/delay-scheduler';
import type { AutoPauseDecision } from './auto-pause';
import { createAutoPauseService } from './auto-pause-service';
import { createInMemoryAutoPauseStore } from './auto-pause-store';

const NOW = new Date('2026-11-06T12:00:00Z');
const pauseDecision = (reason: 'marked_wrong_rate' | 'cost_cap_reached'): AutoPauseDecision => ({
  pauseWorkspace: { reason, reasons: [reason] },
  suspendChannels: [],
  warnAdmin: [],
  halveRateLimit: false,
});
const none: AutoPauseDecision = {
  pauseWorkspace: null,
  suspendChannels: [],
  warnAdmin: [],
  halveRateLimit: false,
};
const job = (ws: string, d: string) => ({
  workspaceId: ws,
  targetId: `c-${d}`,
  draftId: d,
  delaySeconds: 120,
});

function setup() {
  let now = 9_000_000;
  const scheduler = createInMemoryAutoSendDelayScheduler(() => now);
  const store = createInMemoryAutoPauseStore();
  const service = createAutoPauseService({ store, scheduler, now: () => NOW });
  return {
    scheduler,
    store,
    service,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe('FR-073 AutoPauseService.apply', () => {
  it('quyết định dừng → đặt cờ TRƯỚC, rồi hủy hẹn giờ của đúng workspace (lý do ai_paused)', async () => {
    const { service, scheduler, store, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    await scheduler.schedule(job('b', 'd2'));
    const r = await service.apply('a', pauseDecision('marked_wrong_rate'));
    expect(r).toMatchObject({ paused: true, newlyPaused: true, cancelled: 1, cancelFailed: false });
    expect(await service.isPaused('a')).toBe(true);
    expect(await service.isPaused('b')).toBe(false);
    expect((await store.get('a')).reason).toBe('marked_wrong_rate');
    tick(120_000);
    expect((await scheduler.claimDue()).map((t) => t.draftId)).toEqual(['d2']);
  });

  it('không có quyết định dừng → không đổi cờ, không hủy gì', async () => {
    const { service, scheduler, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    expect(await service.apply('a', none)).toMatchObject({ paused: false, cancelled: 0 });
    tick(120_000);
    expect(await scheduler.claimDue()).toHaveLength(1);
  });

  it('đã dừng: giữ nguyên lý do/giờ đầu tiên (không ghi đè), vẫn dọn hẹn giờ lọt vào sau', async () => {
    const { service, scheduler, store } = setup();
    await service.apply('a', pauseDecision('marked_wrong_rate'));
    await scheduler.schedule(job('a', 'late'));
    const r = await service.apply('a', pauseDecision('cost_cap_reached'));
    expect(r).toMatchObject({ paused: true, newlyPaused: false, cancelled: 1 });
    expect((await store.get('a')).reason).toBe('marked_wrong_rate');
  });

  it('hủy hẹn giờ lỗi → cờ VẪN đặt, báo cancelFailed', async () => {
    const store = createInMemoryAutoPauseStore();
    const scheduler = createInMemoryAutoSendDelayScheduler();
    scheduler.cancelAllForWorkspace = async () => {
      throw new Error('queue down');
    };
    const service = createAutoPauseService({ store, scheduler, now: () => NOW });
    const r = await service.apply('a', pauseDecision('cost_cap_reached'));
    expect(r).toMatchObject({ paused: true, cancelFailed: true });
    expect(await service.isPaused('a')).toBe(true);
  });

  it('store lỗi khi ghi → vẫn hủy hẹn giờ, báo store_failed (không nuốt lỗi)', async () => {
    const store = createInMemoryAutoPauseStore();
    store.compareAndSet = async () => {
      throw new Error('db down');
    };
    const scheduler = createInMemoryAutoSendDelayScheduler();
    await scheduler.schedule(job('a', 'd1'));
    const service = createAutoPauseService({ store, scheduler, now: () => NOW });
    const r = await service.apply('a', pauseDecision('marked_wrong_rate'));
    expect(r).toMatchObject({ paused: false, error: 'store_failed', cancelled: 1 });
  });

  it('workspaceId rỗng → invalid_input, không đụng gì', async () => {
    const { service } = setup();
    expect(await service.apply('  ', pauseDecision('marked_wrong_rate'))).toMatchObject({
      paused: false,
      error: 'invalid_input',
    });
  });
});

describe('FR-073 AutoPause xung đột ghi / đầu vào hỏng', () => {
  const conflicted = () => {
    const store = createInMemoryAutoPauseStore();
    store.compareAndSet = async () => false;
    const scheduler = createInMemoryAutoSendDelayScheduler();
    return createAutoPauseService({ store, scheduler, now: () => NOW });
  };
  it('xung đột ghi liên tục khi đặt cờ → store_failed (không báo đã dừng)', async () => {
    const r = await conflicted().apply('a', pauseDecision('marked_wrong_rate'));
    expect(r).toMatchObject({ paused: false, error: 'store_failed' });
  });
  it('xung đột ghi liên tục khi Bật lại → ném lỗi rõ ràng, không nuốt', async () => {
    const store = createInMemoryAutoPauseStore();
    const real = createAutoPauseService({
      store,
      scheduler: createInMemoryAutoSendDelayScheduler(),
      now: () => NOW,
    });
    await real.apply('a', pauseDecision('marked_wrong_rate'));
    store.compareAndSet = async () => false;
    await expect(real.resume({ workspaceId: 'a', role: 'owner', userId: 'u' })).rejects.toThrow(
      /xung đột/,
    );
  });
  it('Bật lại với workspaceId/userId rỗng → invalid_input', async () => {
    const { service } = setup();
    expect(await service.resume({ workspaceId: '', role: 'owner', userId: 'u' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(await service.resume({ workspaceId: 'a', role: 'owner', userId: ' ' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });
  it('store bộ nhớ từ chối compareAndSet lệch workspace hoặc lệch trạng thái', async () => {
    const store = createInMemoryAutoPauseStore();
    const a = await store.get('a');
    expect(await store.compareAndSet(a, { workspaceId: 'b', pausedAt: NOW })).toBe(false);
    expect(await store.compareAndSet({ ...a, pausedAt: NOW }, { ...a, pausedAt: NOW })).toBe(false);
  });
});

describe('AutoPauseService.resume / isPaused', () => {
  it('chỉ Owner bật lại; Staff/viewer → forbidden và cờ giữ nguyên', async () => {
    const { service } = setup();
    await service.apply('a', pauseDecision('marked_wrong_rate'));
    expect(await service.resume({ workspaceId: 'a', role: 'staff', userId: 'u' })).toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(await service.resume({ workspaceId: 'a', role: 'viewer', userId: 'u' })).toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(await service.isPaused('a')).toBe(true);
    expect(await service.resume({ workspaceId: 'a', role: 'owner', userId: 'u' })).toMatchObject({
      ok: true,
    });
    expect(await service.isPaused('a')).toBe(false);
  });

  it('bật lại khi chưa dừng → not_stopped', async () => {
    const { service } = setup();
    expect(await service.resume({ workspaceId: 'a', role: 'owner', userId: 'u' })).toEqual({
      ok: false,
      code: 'not_stopped',
    });
  });

  it('isPaused: lỗi đọc hoặc workspaceId hỏng → coi là ĐÃ DỪNG (fail-safe)', async () => {
    const store = createInMemoryAutoPauseStore();
    store.get = async () => {
      throw new Error('db down');
    };
    const service = createAutoPauseService({
      store,
      scheduler: createInMemoryAutoSendDelayScheduler(),
      now: () => NOW,
    });
    expect(await service.isPaused('a')).toBe(true);
    expect(await service.isPaused('')).toBe(true);
  });
});
