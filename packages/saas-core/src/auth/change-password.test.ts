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
  const revokeAll = vi.fn().mockResolvedValue(2);
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
    changeCredential: changeAndRevoke,
    revokeAll,
  });
  return { flow, limiter, check, changeAndRevoke, revokeAll };
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

  it('Better Auth INVALID_PASSWORD → wrong_password, không xóa bộ đếm, không xóa phiên', async () => {
    const s = setup();
    s.changeAndRevoke.mockRejectedValueOnce({
      statusCode: 400,
      body: { code: 'INVALID_PASSWORD' },
    });
    expect(await run(s.flow)).toEqual({ status: 'wrong_password' });
    expect(s.limiter.reset).not.toHaveBeenCalled();
    expect(s.revokeAll).not.toHaveBeenCalled();
  });

  it('401 (phiên vừa bị thu hồi) → unauthenticated; 400 mã khác → INTERNAL, cause không có thông báo gốc', async () => {
    const a = setup();
    a.changeAndRevoke.mockRejectedValueOnce({ status: 401 });
    expect(await run(a.flow)).toEqual({ status: 'unauthenticated' });
    const b = setup();
    b.changeAndRevoke.mockRejectedValueOnce(
      Object.assign(new Error('argon2id$secret-hash'), {
        statusCode: 400,
        body: { code: 'CREDENTIAL_ACCOUNT_NOT_FOUND' },
      }),
    );
    const error = await run(b.flow).catch((e) => e);
    expect(error).toMatchObject({ code: 'INTERNAL' });
    expect(JSON.stringify(error.cause)).not.toContain('argon2id');
  });

  it('đổi xong mà xóa phiên lỗi → thử lại một lần, vẫn lỗi thì vẫn ok (không báo chưa đổi)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup();
    s.revokeAll.mockRejectedValue(new Error('db down'));
    expect(await run(s.flow)).toEqual({ status: 'ok' });
    expect(s.revokeAll).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('change_password_revoke_failed');
    expect(s.limiter.reset).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('xóa phiên lỗi lần đầu, lần hai được → ok, gọi 2 lần', async () => {
    const s = setup();
    s.revokeAll.mockRejectedValueOnce(new Error('tạm thời'));
    expect(await run(s.flow)).toEqual({ status: 'ok' });
    expect(s.revokeAll).toHaveBeenCalledTimes(2);
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
    expect(s.revokeAll).toHaveBeenCalledWith('u1');
    expect(s.limiter.reset).toHaveBeenCalledWith('reauth', { userId: 'u1' });
  });
});
