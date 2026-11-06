import { describe, expect, it } from 'vitest';
import { createMemoryStore, createRateLimiter } from '../../ratelimit';
import { createMemoryRecoveryStore } from './memory-store';
import { RELEASE_WAIT_MS, VERIFY_TTL_MS } from './phase';
import { createTwoFactorRecovery } from './service';
import type { RecoveryAuditEntry } from './types';

const OWNER = { id: 'u1', email: 'chu@shop.test', twoFactorEnabled: true };
const ADMIN = { id: 'adm', email: 'admin@cf.test', twoFactorEnabled: true };
const NO2FA = { id: 'u2', email: 'khong@shop.test', twoFactorEnabled: false };
const PASSWORD = 'mk-dung';

function setup() {
  let clock = 1_000_000;
  let seq = 0;
  let revokeBroken = false;
  const store = createMemoryRecoveryStore();
  const audit: RecoveryAuditEntry[] = [];
  const mails = {
    verify: [] as { to: string; token: string }[],
    cancel: [] as { to: string; cancelToken: string; releaseAt: number | null }[],
    completed: [] as string[],
  };
  const calls = { disabled: [] as string[], revoked: [] as string[] };
  const people = [OWNER, ADMIN, NO2FA];
  const service = createTwoFactorRecovery({
    store,
    audit: { record: async (e) => void audit.push(e) },
    mailer: {
      sendVerify: async (i) => void mails.verify.push(i),
      sendCancelNotice: async (i) => void mails.cancel.push(i),
      sendCompleted: async (i) => void mails.completed.push(i.to),
    },
    users: {
      findByEmail: async (email) => people.find((p) => p.email === email) ?? null,
      findById: async (id) => people.find((p) => p.id === id) ?? null,
      isPlatformAdmin: async (id) => id === ADMIN.id || id === 'adm2',
    },
    effects: {
      verifyPassword: async (_id, pw) => pw === PASSWORD,
      disableTwoFactor: async (id) => void calls.disabled.push(id),
      revokeAllSessions: async (id) => {
        if (revokeBroken) throw new Error('hỏng');
        calls.revoked.push(id);
        return 2;
      },
    },
    limiter: createRateLimiter({ store: createMemoryStore(), secret: 'khoa-thu' }),
    secret: 'khoa-thu',
    now: () => clock,
    newToken: () => `tk-${++seq}`,
    newId: () => `req-${++seq}`,
  });
  return {
    service,
    store,
    audit,
    mails,
    calls,
    failRevoke: () => {
      revokeBroken = true;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

async function toWaiting(ctx: ReturnType<typeof setup>) {
  await ctx.service.requestReset({ email: OWNER.email });
  const token = ctx.mails.verify[0]?.token as string;
  const verified = await ctx.service.confirmEmail({ token });
  expect(verified.status).toBe('ok');
  return { token, cancelToken: ctx.mails.cancel[0]?.cancelToken as string };
}

describe('FR-001 khôi phục 2FA — yêu cầu', () => {
  it('luôn trả accepted, chỉ gửi thư khi tài khoản có 2FA', async () => {
    const ctx = setup();
    expect(await ctx.service.requestReset({ email: OWNER.email })).toEqual({ status: 'accepted' });
    expect(await ctx.service.requestReset({ email: 'la@shop.test' })).toEqual({
      status: 'accepted',
    });
    expect(await ctx.service.requestReset({ email: NO2FA.email })).toEqual({ status: 'accepted' });
    expect(ctx.mails.verify.map((m) => m.to)).toEqual([OWNER.email]);
  });

  it('chỉ lưu băm token, không lưu token thô', async () => {
    const ctx = setup();
    await ctx.service.requestReset({ email: OWNER.email });
    const token = ctx.mails.verify[0]?.token as string;
    const row = await ctx.store.findOpenByUser(OWNER.id);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row?.verifyHash).not.toBe(token);
  });

  it('yêu cầu mới thay yêu cầu cũ (superseded), link cũ vô hiệu', async () => {
    const ctx = setup();
    await ctx.service.requestReset({ email: OWNER.email });
    const first = ctx.mails.verify[0]?.token as string;
    await ctx.service.requestReset({ email: OWNER.email });
    expect((await ctx.service.confirmEmail({ token: first })).status).toBe('invalid_token');
    expect(ctx.audit.map((e) => e.event)).toContain('superseded');
  });

  it('giới hạn tốc độ: quá 3 lần/giờ cho một email thì từ chối', async () => {
    const ctx = setup();
    for (let i = 0; i < 3; i++) await ctx.service.requestReset({ email: OWNER.email });
    const fourth = await ctx.service.requestReset({ email: OWNER.email });
    expect(fourth.status).toBe('rate_limited');
  });
});

describe('FR-001 khôi phục 2FA — xác minh email và chờ', () => {
  it('token sai hoặc hết hạn bị từ chối', async () => {
    const ctx = setup();
    await ctx.service.requestReset({ email: OWNER.email });
    expect((await ctx.service.confirmEmail({ token: 'sai' })).status).toBe('invalid_token');
    ctx.advance(VERIFY_TTL_MS + 1);
    expect(
      (await ctx.service.confirmEmail({ token: ctx.mails.verify[0]?.token as string })).status,
    ).toBe('invalid_token');
  });

  it('xác minh xong gửi email báo kèm link hủy và ghi kiểm toán', async () => {
    const ctx = setup();
    await toWaiting(ctx);
    expect(ctx.mails.cancel).toHaveLength(1);
    expect(ctx.mails.cancel[0]?.to).toBe(OWNER.email);
    expect(ctx.audit.map((e) => e.event)).toEqual(['requested', 'email_verified']);
  });

  it('chưa hết thời gian chờ thì không hoàn tất được (not_ready)', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS - 1);
    const res = await ctx.service.complete({ token, password: PASSWORD });
    expect(res.status).toBe('not_ready');
    expect(ctx.calls.disabled).toEqual([]);
  });

  it('xác minh lần hai cùng token bị từ chối (dùng một lần)', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    expect((await ctx.service.confirmEmail({ token })).status).toBe('invalid_token');
  });
});

describe('FR-001 khôi phục 2FA — hoàn tất', () => {
  it('đủ hạn chờ + đúng mật khẩu → tắt 2FA, xóa mọi phiên, báo email', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS);
    expect(await ctx.service.complete({ token, password: PASSWORD })).toEqual({ status: 'ok' });
    expect(ctx.calls.disabled).toEqual([OWNER.id]);
    expect(ctx.calls.revoked).toEqual([OWNER.id]);
    expect(ctx.mails.completed).toEqual([OWNER.email]);
    expect(ctx.audit.at(-1)?.event).toBe('completed');
  });

  it('sai mật khẩu: không tiêu token, ghi kiểm toán, thử lại đúng vẫn được', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS);
    expect((await ctx.service.complete({ token, password: 'sai' })).status).toBe('wrong_password');
    expect(ctx.calls.disabled).toEqual([]);
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe('ok');
  });

  it('quá cửa sổ hoàn tất → invalid_token', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS + 8 * 24 * 3600 * 1000);
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe(
      'invalid_token',
    );
  });

  it('hai lần hoàn tất song song: chỉ một thành công, hiệu ứng chạy một lần', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS);
    const results = await Promise.all([
      ctx.service.complete({ token, password: PASSWORD }),
      ctx.service.complete({ token, password: PASSWORD }),
    ]);
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
    expect(ctx.calls.disabled).toHaveLength(1);
  });

  it('giới hạn tốc độ khi đoán mật khẩu: quá 5 lần sai thì rate_limited', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS);
    for (let i = 0; i < 5; i++) await ctx.service.complete({ token, password: 'sai' });
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe('rate_limited');
  });
});

describe('FR-001 khôi phục 2FA — duyệt sớm và hủy', () => {
  it('quản trị viên khác duyệt → hoàn tất ngay không cần chờ', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    const req = await ctx.store.findOpenByUser(OWNER.id);
    expect(
      await ctx.service.approve({ requestId: req?.id as string, approverId: ADMIN.id }),
    ).toEqual({ status: 'ok' });
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe('ok');
    expect(ctx.audit.some((e) => e.event === 'approved' && e.actorId === ADMIN.id)).toBe(true);
  });

  it('không phải admin, hoặc tự duyệt yêu cầu của mình, bị từ chối', async () => {
    const ctx = setup();
    await toWaiting(ctx);
    const req = await ctx.store.findOpenByUser(OWNER.id);
    const id = req?.id as string;
    expect((await ctx.service.approve({ requestId: id, approverId: NO2FA.id })).status).toBe(
      'forbidden',
    );
    expect((await ctx.service.approve({ requestId: id, approverId: OWNER.id })).status).toBe(
      'forbidden',
    );
  });

  it('admin tự duyệt yêu cầu của chính admin bị từ chối', async () => {
    const ctx = setup();
    await ctx.service.requestReset({ email: ADMIN.email });
    await ctx.service.confirmEmail({ token: ctx.mails.verify[0]?.token as string });
    const req = await ctx.store.findOpenByUser(ADMIN.id);
    expect(
      (await ctx.service.approve({ requestId: req?.id as string, approverId: ADMIN.id })).status,
    ).toBe('forbidden');
  });

  it('duyệt yêu cầu chưa xác minh email hoặc không tồn tại → not_found', async () => {
    const ctx = setup();
    await ctx.service.requestReset({ email: OWNER.email });
    const req = await ctx.store.findOpenByUser(OWNER.id);
    expect(
      (await ctx.service.approve({ requestId: req?.id as string, approverId: ADMIN.id })).status,
    ).toBe('not_found');
    expect((await ctx.service.approve({ requestId: 'x', approverId: ADMIN.id })).status).toBe(
      'not_found',
    );
  });

  it('hủy bằng link hủy chặn hoàn tất', async () => {
    const ctx = setup();
    const { token, cancelToken } = await toWaiting(ctx);
    expect(await ctx.service.cancel({ token: cancelToken })).toEqual({ status: 'ok' });
    ctx.advance(RELEASE_WAIT_MS);
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe(
      'invalid_token',
    );
    expect(ctx.calls.disabled).toEqual([]);
    expect((await ctx.service.cancel({ token: cancelToken })).status).toBe('invalid_token');
  });
});

describe('FR-001 khôi phục 2FA — hardening sau kiểm chứng', () => {
  it('người lạ gõ lại email không hủy yêu cầu đang chờ', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    await ctx.service.requestReset({ email: OWNER.email });
    ctx.advance(RELEASE_WAIT_MS);
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe('ok');
    expect(ctx.mails.verify).toHaveLength(1);
  });

  it('tài khoản admin không tự hết hạn chờ, chỉ admin khác duyệt', async () => {
    const ctx = setup();
    await ctx.service.requestReset({ email: ADMIN.email });
    const token = ctx.mails.verify[0]?.token as string;
    await ctx.service.confirmEmail({ token });
    expect(ctx.mails.cancel[0]?.releaseAt).toBeNull();
    ctx.advance(365 * 24 * 3600 * 1000);
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe('not_ready');
    const req = await ctx.store.findOpenByUser(ADMIN.id);
    await ctx.service.approve({ requestId: req?.id as string, approverId: 'adm2' });
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe('ok');
  });

  it('lỗi giữa chừng: ghi complete_failed, 2FA chưa bị tắt, yêu cầu quay lại waiting', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS);
    ctx.failRevoke();
    await expect(ctx.service.complete({ token, password: PASSWORD })).rejects.toThrow();
    expect(ctx.calls.disabled).toEqual([]);
    expect(ctx.audit.at(-1)?.event).toBe('complete_failed');
    expect((await ctx.store.findOpenByUser(OWNER.id))?.status).toBe('waiting');
  });

  it('cancelOpenForUser hủy yêu cầu còn mở (đăng nhập lại được 2FA)', async () => {
    const ctx = setup();
    const { token } = await toWaiting(ctx);
    expect(await ctx.service.cancelOpenForUser(OWNER.id)).toBe(true);
    expect(await ctx.service.cancelOpenForUser(OWNER.id)).toBe(false);
    ctx.advance(RELEASE_WAIT_MS);
    expect((await ctx.service.complete({ token, password: PASSWORD })).status).toBe(
      'invalid_token',
    );
  });
});

describe('FR-001 khôi phục 2FA — kiểm toán', () => {
  it('không chứa email, token hay IP', async () => {
    const ctx = setup();
    const { token, cancelToken } = await toWaiting(ctx);
    ctx.advance(RELEASE_WAIT_MS);
    await ctx.service.complete({ token, password: PASSWORD });
    const text = JSON.stringify(ctx.audit);
    for (const secret of [OWNER.email, token, cancelToken, PASSWORD]) {
      expect(text).not.toContain(secret);
    }
    expect(ctx.audit.map((e) => e.event)).toEqual(['requested', 'email_verified', 'completed']);
  });
});
