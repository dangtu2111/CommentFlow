import { describe, expect, it, vi } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth';
import { createChangePasswordFlow } from './change-password';

const GOOD_OLD = 'Mat-khau-cu-12345';
const GOOD_NEW = 'Mat-khau-moi-67890';
const headers = new Headers({ cookie: 'session=abc' });

type Verdict = { ok: true } | { ok: false; reason: 'common' | 'pwned' };

function setup(over: { session?: boolean; verdict?: Verdict; allowed?: boolean } = {}) {
  const getSession = vi
    .fn()
    .mockResolvedValue(over.session === false ? null : { user: { id: 'u1' } });
  const changeAndRevoke = vi.fn().mockResolvedValue(undefined);
  const limiter = {
    check: vi
      .fn()
      .mockResolvedValue(
        over.allowed === false ? { allowed: false, retryAfterSeconds: 120 } : { allowed: true },
      ),
    reset: vi.fn().mockResolvedValue(undefined),
  };
  const check = vi.fn().mockResolvedValue(over.verdict ?? { ok: true });
  const flow = createChangePasswordFlow({
    auth: { api: { getSession } } as never,
    authDb: {} as never,
    limiter: limiter as never,
    passwordPolicy: { check },
    changeAndRevoke,
  });
  return { flow, limiter, check, changeAndRevoke };
}

const run = (
  flow: ReturnType<typeof setup>['flow'],
  over: Partial<{ c: string; n: string }> = {},
) =>
  flow.changePassword({
    headers,
    currentPassword: over.c ?? GOOD_OLD,
    newPassword: over.n ?? GOOD_NEW,
  });

describe('FR-001 đổi mật khẩu (saas-core)', () => {
  it('chưa đăng nhập → unauthenticated, không đụng bộ đếm', async () => {
    const s = setup({ session: false });
    expect(await run(s.flow)).toEqual({ status: 'unauthenticated' });
    expect(s.limiter.check).not.toHaveBeenCalled();
    expect(s.changeAndRevoke).not.toHaveBeenCalled();
  });

  it('mật khẩu mới quá ngắn / quá dài → invalid, không gọi policy hay đổi', async () => {
    const s = setup();
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const long = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    expect(await run(s.flow, { n: short })).toEqual({ status: 'invalid', reason: 'too_short' });
    expect(await run(s.flow, { n: long })).toEqual({ status: 'invalid', reason: 'too_long' });
    expect(s.check).not.toHaveBeenCalled();
    expect(s.changeAndRevoke).not.toHaveBeenCalled();
  });

  it('đúng ngưỡng 10 và 128 ký tự không bị chặn bởi độ dài', async () => {
    const s = setup();
    expect((await run(s.flow, { n: 'x'.repeat(MIN_PASSWORD_LENGTH) })).status).toBe('ok');
    expect((await run(s.flow, { n: 'y'.repeat(MAX_PASSWORD_LENGTH) })).status).toBe('ok');
  });

  it('mật khẩu hiện tại quá dài → wrong_password (không gọi Better Auth)', async () => {
    const s = setup();
    expect(await run(s.flow, { c: 'a'.repeat(MAX_PASSWORD_LENGTH + 1) })).toEqual({
      status: 'wrong_password',
    });
    expect(s.changeAndRevoke).not.toHaveBeenCalled();
  });

  it('trùng mật khẩu hiện tại → same_password', async () => {
    const s = setup();
    expect(await run(s.flow, { n: GOOD_OLD })).toEqual({ status: 'same_password' });
    expect(s.changeAndRevoke).not.toHaveBeenCalled();
  });

  it('AUTH-PWNED: phổ biến/đã lộ → invalid kèm lý do, không đổi', async () => {
    for (const reason of ['common', 'pwned'] as const) {
      const s = setup({ verdict: { ok: false, reason } });
      expect(await run(s.flow)).toEqual({ status: 'invalid', reason });
      expect(s.changeAndRevoke).not.toHaveBeenCalled();
    }
  });

  it('vượt hạn mức → rate_limited, không kiểm policy (không dùng làm máy gọi HIBP)', async () => {
    const s = setup({ allowed: false });
    expect(await run(s.flow)).toEqual({ status: 'rate_limited', retryAfterSeconds: 120 });
    expect(s.check).not.toHaveBeenCalled();
    expect(s.changeAndRevoke).not.toHaveBeenCalled();
    expect(s.limiter.check).toHaveBeenCalledWith('reauth', { userId: 'u1' });
  });

  it('Better Auth từ chối mật khẩu hiện tại (400/401/403) → wrong_password, không xóa bộ đếm', async () => {
    for (const status of [400, 401, 403]) {
      const s = setup();
      s.changeAndRevoke.mockRejectedValueOnce({ status });
      expect(await run(s.flow)).toEqual({ status: 'wrong_password' });
      expect(s.limiter.reset).not.toHaveBeenCalled();
    }
  });

  it('lỗi khác → ném AppError INTERNAL, không nuốt', async () => {
    const s = setup();
    s.changeAndRevoke.mockRejectedValueOnce(new Error('db down'));
    await expect(run(s.flow)).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('thành công → đổi + xóa mọi phiên đúng một lần với headers của phiên, xóa bộ đếm', async () => {
    const s = setup();
    expect(await run(s.flow)).toEqual({ status: 'ok' });
    expect(s.changeAndRevoke).toHaveBeenCalledTimes(1);
    expect(s.changeAndRevoke).toHaveBeenCalledWith({
      headers,
      currentPassword: GOOD_OLD,
      newPassword: GOOD_NEW,
    });
    expect(s.limiter.reset).toHaveBeenCalledWith('reauth', { userId: 'u1' });
  });
});
