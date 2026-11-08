import { describe, expect, it, vi } from 'vitest';
import { buildPushArgs, runPushSafe } from './push-safe.mjs';

describe('buildPushArgs', () => {
  it('chưa có upstream → đặt upstream tới origin/HEAD; đã có → push trơn', () => {
    expect(buildPushArgs([], { hasUpstream: false })).toEqual({
      ok: true,
      args: ['-u', 'origin', 'HEAD'],
    });
    expect(buildPushArgs([], { hasUpstream: true })).toEqual({ ok: true, args: [] });
  });

  it('tham số người dùng được giữ nguyên', () => {
    expect(buildPushArgs(['origin', 'feat/x'], { hasUpstream: true })).toEqual({
      ok: true,
      args: ['origin', 'feat/x'],
    });
  });

  it.each([
    ['--force'],
    ['-f'],
    ['--force-with-lease'],
    ['--force-if-includes'],
    ['+main'],
    ['origin', '+feat/x'],
    ['--mirror'],
    ['--delete'],
  ])('không bao giờ cho force/xóa nhánh (%s)', (...argv) => {
    const result = buildPushArgs(argv, { hasUpstream: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/force|xóa|mirror/i);
  });
});

describe('runPushSafe', () => {
  const base = { argv: [], hasUpstream: true, log: vi.fn() };

  it('precheck xanh → push, trả mã thoát của push', () => {
    const push = vi.fn(() => 0);
    const result = runPushSafe({ ...base, precheck: () => 0, push });
    expect(push).toHaveBeenCalledWith([]);
    expect(result.exitCode).toBe(0);
  });

  it('precheck đỏ (mã ≠ 0) → KHÔNG push, báo rõ, thoát ≠ 0', () => {
    const push = vi.fn(() => 0);
    const log = vi.fn();
    for (const code of [1, 2, 127, null]) {
      const result = runPushSafe({ ...base, log, precheck: () => code, push });
      expect(result.exitCode).not.toBe(0);
    }
    expect(push).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/KHÔNG push/);
  });

  it('tham số bị cấm → không chạy cả precheck lẫn push', () => {
    const precheck = vi.fn(() => 0);
    const push = vi.fn(() => 0);
    const result = runPushSafe({ ...base, argv: ['--force'], precheck, push });
    expect(precheck).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(result.exitCode).not.toBe(0);
  });

  it('push lỗi → báo và thoát ≠ 0', () => {
    const result = runPushSafe({ ...base, precheck: () => 0, push: () => 1 });
    expect(result.exitCode).not.toBe(0);
  });
});
