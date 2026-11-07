import { describe, expect, it, vi } from 'vitest';
import { createDisconnectChannelAction } from './channel-disconnect';

const SESSION = { workspaceId: 'w1', userId: 'u1' };
const CHANNEL = '2f0c8f6e-7a53-4d0e-9c7a-0b6f3c1f2a11';

const make = (clear: (s: typeof SESSION, id: string) => Promise<void>) => {
  const warn = vi.fn();
  return { action: createDisconnectChannelAction({ clear, warn }), warn };
};

describe('createDisconnectChannelAction', () => {
  it('id không phải uuid → not_found, không gọi DB', async () => {
    const clear = vi.fn();
    const { action } = make(clear);
    expect(await action(SESSION, 'abc')).toEqual({ ok: false, reason: 'not_found' });
    expect(await action(SESSION, null)).toEqual({ ok: false, reason: 'not_found' });
    expect(clear).not.toHaveBeenCalled();
  });

  it('thành công → ok, gọi đúng kênh với phiên của người dùng', async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    const { action } = make(clear);
    expect(await action(SESSION, CHANNEL)).toEqual({ ok: true });
    expect(clear).toHaveBeenCalledWith(SESSION, CHANNEL);
  });

  it('DB báo không có kênh (P0002) → not_found', async () => {
    const { action } = make(() => Promise.reject(Object.assign(new Error('x'), { code: 'P0002' })));
    expect(await action(SESSION, CHANNEL)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('DB từ chối quyền (42501) → forbidden', async () => {
    const { action } = make(() => Promise.reject(Object.assign(new Error('x'), { code: '42501' })));
    expect(await action(SESSION, CHANNEL)).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('lỗi khác → unavailable, ghi log không kèm id kênh/token', async () => {
    const { action, warn } = make(() => Promise.reject(new Error('boom token=abc')));
    expect(await action(SESSION, CHANNEL)).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('abc');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(CHANNEL);
  });
});
