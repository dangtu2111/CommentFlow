import { describe, expect, it } from 'vitest';
import { createInMemoryAutoSendDelayScheduler } from '../delay/delay-scheduler';
import { createEmergencyStopService } from './emergency-service';
import { createInMemoryEmergencyStopStore } from './emergency-store';

function setup() {
  let now = 9_000_000;
  const scheduler = createInMemoryAutoSendDelayScheduler(() => now);
  const store = createInMemoryEmergencyStopStore();
  const service = createEmergencyStopService({ store, scheduler, now: () => new Date(now) });
  return {
    scheduler,
    store,
    service,
    tick: (ms: number) => {
      now += ms;
    },
  };
}
const job = (ws: string, d: string) => ({
  workspaceId: ws,
  targetId: `c-${d}`,
  draftId: d,
  delaySeconds: 120,
});
const actor = (ws: string, role: 'owner' | 'staff' | 'viewer' = 'staff') => ({
  workspaceId: ws,
  role,
  userId: 'u1',
});

describe('FR-073 EmergencyStopService.stop', () => {
  it('đặt cờ và hủy mọi hẹn giờ của workspace, không đụng workspace khác', async () => {
    const { service, scheduler, store, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    await scheduler.schedule(job('a', 'd2'));
    await scheduler.schedule(job('b', 'd3'));
    const r = await service.stop(actor('a'));
    expect(r).toMatchObject({ ok: true, cancelled: 2, cancelFailed: false });
    expect((await store.get('a')).stoppedAt).not.toBeNull();
    expect((await store.get('b')).stoppedAt).toBeNull();
    tick(120_000);
    expect((await scheduler.claimDue()).map((t) => t.draftId)).toEqual(['d3']);
  });

  it('viewer → forbidden và không đổi gì', async () => {
    const { service, scheduler, store, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    expect(await service.stop(actor('a', 'viewer'))).toEqual({ ok: false, code: 'forbidden' });
    expect((await store.get('a')).stoppedAt).toBeNull();
    tick(120_000);
    expect(await scheduler.claimDue()).toHaveLength(1);
  });

  it('Dừng lặp lại: no-op có mã, vẫn dọn hẹn giờ lọt vào sau', async () => {
    const { service, scheduler } = setup();
    await service.stop(actor('a'));
    await scheduler.schedule(job('a', 'late'));
    const r = await service.stop(actor('a', 'owner'));
    expect(r).toMatchObject({ ok: false, code: 'already_stopped', cancelled: 1 });
  });

  it('hủy hẹn giờ lỗi → cờ VẪN đặt, báo cancelFailed (không nuốt lỗi)', async () => {
    const store = createInMemoryEmergencyStopStore();
    const scheduler = createInMemoryAutoSendDelayScheduler();
    scheduler.cancelAllForWorkspace = async () => {
      throw new Error('queue down');
    };
    const service = createEmergencyStopService({ store, scheduler, now: () => new Date() });
    const r = await service.stop(actor('a'));
    expect(r).toMatchObject({ ok: true, cancelFailed: true, cancelled: 0 });
    expect((await store.get('a')).stoppedAt).not.toBeNull();
  });

  it('workspaceId rỗng → invalid_input', async () => {
    const { service } = setup();
    expect(await service.stop(actor(' '))).toEqual({ ok: false, code: 'invalid_input' });
  });
});

describe('FR-073 xung đột ghi (compareAndSet)', () => {
  it('thua một lần thì đọc lại và thử lại; thua liên tục → ném lỗi, không báo thành công giả', async () => {
    const real = createInMemoryEmergencyStopStore();
    let losses = 1;
    const flaky = {
      get: real.get,
      compareAndSet: async (...a: Parameters<typeof real.compareAndSet>) =>
        losses-- > 0 ? false : real.compareAndSet(...a),
    };
    const scheduler = createInMemoryAutoSendDelayScheduler();
    const svc = createEmergencyStopService({ store: flaky, scheduler, now: () => new Date() });
    expect(await svc.stop(actor('a'))).toMatchObject({ ok: true });
    const never = { get: real.get, compareAndSet: async () => false };
    const svc2 = createEmergencyStopService({ store: never, scheduler, now: () => new Date() });
    await expect(svc2.resume(actor('a', 'owner'))).rejects.toThrow('xung đột');
  });

  it('store bộ nhớ: từ chối khi trạng thái đã đổi hoặc khác workspace', async () => {
    const store = createInMemoryEmergencyStopStore();
    const a = await store.get('a');
    const stoppedA = { workspaceId: 'a', stoppedAt: new Date(1), stoppedBy: 'u' };
    expect(await store.compareAndSet(a, { ...stoppedA, workspaceId: 'b' })).toBe(false);
    expect(await store.compareAndSet(a, stoppedA)).toBe(true);
    expect(await store.compareAndSet(a, stoppedA)).toBe(false);
  });
});

describe('FR-073 store hỏng lúc Dừng', () => {
  it('vẫn hủy hẹn giờ rồi báo store_failed; vai trò không được phép thì forbidden', async () => {
    const scheduler = createInMemoryAutoSendDelayScheduler();
    await scheduler.schedule(job('a', 'd1'));
    const store = createInMemoryEmergencyStopStore();
    store.get = async () => {
      throw new Error('db down');
    };
    const svc = createEmergencyStopService({ store, scheduler, now: () => new Date() });
    expect(await svc.stop(actor('a'))).toEqual({
      ok: false,
      code: 'store_failed',
      cancelled: 1,
      cancelFailed: false,
    });
    expect(await svc.stop(actor('a', 'viewer'))).toEqual({ ok: false, code: 'forbidden' });
  });

  it('Date hỏng (NaN) vẫn Bật lại được (so sánh Object.is)', async () => {
    const store = createInMemoryEmergencyStopStore();
    const bad = { workspaceId: 'a', stoppedAt: new Date('x') };
    expect(await store.compareAndSet(await store.get('a'), bad)).toBe(true);
    expect(await store.compareAndSet(bad, { workspaceId: 'a', stoppedAt: null })).toBe(true);
  });
});

describe('FR-073 EmergencyStopService.resume', () => {
  it('chỉ Owner; Staff bị từ chối và workspace vẫn dừng', async () => {
    const { service, store } = setup();
    await service.stop(actor('a'));
    expect(await service.resume(actor('a', 'staff'))).toEqual({ ok: false, code: 'forbidden' });
    expect((await store.get('a')).stoppedAt).not.toBeNull();
    expect(await service.resume(actor('a', 'owner'))).toMatchObject({ ok: true });
    expect((await store.get('a')).stoppedAt).toBeNull();
  });

  it('Bật lại không hồi sinh câu đã hủy', async () => {
    const { service, scheduler, tick } = setup();
    await scheduler.schedule(job('a', 'd1'));
    await service.stop(actor('a'));
    await service.resume(actor('a', 'owner'));
    tick(120_000);
    expect(await scheduler.claimDue()).toEqual([]);
  });
});

describe('FR-073 isStopped — cờ nuôi decideAutoSend/sendRecheck', () => {
  it('phản ánh trạng thái từng workspace', async () => {
    const { service } = setup();
    expect(await service.isStopped('a')).toBe(false);
    await service.stop(actor('a'));
    expect(await service.isStopped('a')).toBe(true);
    expect(await service.isStopped('b')).toBe(false);
  });

  it('lỗi đọc store → coi là ĐÃ DỪNG (fail-safe)', async () => {
    const store = createInMemoryEmergencyStopStore();
    store.get = async () => {
      throw new Error('db down');
    };
    const service = createEmergencyStopService({
      store,
      scheduler: createInMemoryAutoSendDelayScheduler(),
      now: () => new Date(),
    });
    expect(await service.isStopped('a')).toBe(true);
  });
});
