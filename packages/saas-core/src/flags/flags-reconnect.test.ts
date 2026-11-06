import type { FlowDb } from '@flow/db/runtime';
import { featureFlags } from '@flow/db/schema/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlags } from './flags';

type ListenFn = (
  channel: string,
  onNotify: (p: string) => void,
  onError?: (e: Error) => void,
) => Promise<() => Promise<void>>;

function setup(listenImpl: ListenFn) {
  const calls = { flags: 0 };
  const tx = {
    select: () => ({
      from: async (table: unknown) => {
        if (table === featureFlags) calls.flags++;
        return [];
      },
    }),
  };
  const db = {
    withSystem: async (fn: (t: unknown) => unknown) => fn(tx),
    withWorkspace: async (_ws: string, fn: (t: unknown) => unknown) => fn(tx),
    listen: listenImpl,
  } as unknown as FlowDb;
  const events: { type: string; attempt: number; delayMs?: number }[] = [];
  const flags = createFlags({ db, defaults: {}, onListenEvent: (e) => events.push(e) });
  return { flags, events, calls };
}

describe('FR-117 LISTEN tự nối lại lùi dần', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('FR-117 mất kết nối → nối lại sau 1s, 2s, 4s; cảnh báo mỗi lần', async () => {
    const errorHandlers: ((e: Error) => void)[] = [];
    let calls = 0;
    const { flags, events } = setup(async (_c, _n, onError) => {
      calls++;
      if (calls >= 2 && calls <= 3) throw new Error('refused');
      if (onError) errorHandlers.push(onError);
      return async () => {};
    });
    await flags.start();
    expect(calls).toBe(1);
    errorHandlers[0]?.(new Error('terminated'));
    expect(events.map((e) => e.type)).toEqual(['lost']);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(4);
    expect(events.map((e) => [e.type, e.attempt, e.delayMs])).toEqual([
      ['lost', 1, 1000],
      ['reconnect_failed', 2, 2000],
      ['reconnect_failed', 3, 4000],
      ['reconnected', 3, undefined],
    ]);
    await flags.stop();
  });

  it('FR-117 độ trễ bị chặn ở 60 giây', async () => {
    const times: number[] = [];
    const { flags } = setup(async () => {
      times.push(Date.now());
      throw new Error('down');
    });
    await flags.start();
    await vi.advanceTimersByTimeAsync(600_000);
    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
    expect(gaps.slice(0, 7)).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000]);
    expect(Math.max(...gaps)).toBe(60_000);
    await flags.stop();
  });

  it('FR-117 nối lại được thì xóa cache và đếm lùi về 1s', async () => {
    const errorHandlers: ((e: Error) => void)[] = [];
    let calls = 0;
    const { flags, calls: reads } = setup(async (_c, _n, onError) => {
      calls++;
      if (onError) errorHandlers.push(onError);
      return async () => {};
    });
    await flags.start();
    await flags.isEnabled('cf.thu');
    expect(reads.flags).toBe(1);
    errorHandlers[0]?.(new Error('x'));
    await vi.advanceTimersByTimeAsync(1000);
    await flags.isEnabled('cf.thu');
    expect(reads.flags).toBe(2);
    errorHandlers[1]?.(new Error('y'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(3);
    await flags.stop();
  });

  it('FR-117 start() ban đầu lỗi không ném, tự thử lại', async () => {
    let calls = 0;
    const { flags, events } = setup(async () => {
      calls++;
      if (calls === 1) throw new Error('boot');
      return async () => {};
    });
    await expect(flags.start()).resolves.toBeUndefined();
    expect(events[0]?.type).toBe('lost');
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(events.at(-1)?.type).toBe('reconnected');
    await flags.stop();
  });

  it('FR-117 stop() hủy hẹn giờ; lỗi sau stop không nối lại', async () => {
    let calls = 0;
    let onErr: ((e: Error) => void) | undefined;
    const { flags } = setup(async (_c, _n, onError) => {
      calls++;
      onErr = onError;
      return async () => {};
    });
    await flags.start();
    onErr?.(new Error('x'));
    await flags.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(1);
    onErr?.(new Error('muộn'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(1);
  });

  it('FR-117 nhiều lỗi của cùng một kết nối chỉ hẹn một lần nối', async () => {
    let calls = 0;
    let onErr: ((e: Error) => void) | undefined;
    const { flags } = setup(async (_c, _n, onError) => {
      calls++;
      onErr = onError;
      return async () => {};
    });
    await flags.start();
    onErr?.(new Error('a'));
    onErr?.(new Error('b'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    await flags.stop();
  });
});
