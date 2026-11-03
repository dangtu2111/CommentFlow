import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from '@flow/db';
import type { AuthDb } from '@flow/db/auth-db';
import { sessions } from '@flow/db/schema/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type Auth,
  type AuthFlows,
  createAuth,
  createAuthFlows,
  createPasswordPolicy,
  createTwoFactorFlows,
} from '../src/auth';
import { wrapAuthDb } from '../src/auth/auth-db';
import { createMemoryTransport, createNotifier, type MailMessage } from '../src/notify';
import { createMemoryStore, createRateLimiter } from '../src/ratelimit';
import { createTestAuthDb } from './helpers';

const BASE_URL = 'http://localhost:3000';
const PASSWORD = 'mat-khau-dai-du-10';
const TEST_SECRET = randomBytes(32).toString('hex');

const transport = createMemoryTransport();
/** Bộ giới hạn mới (kho bộ nhớ) cho mỗi bộ luồng: các test không ảnh hưởng nhau. */
/** Kiểm mật khẩu chỉ bằng danh sách cục bộ (test không gọi mạng). */
const localPolicy = createPasswordPolicy({ pwnedEnabled: false });
const freshLimiter = () => createRateLimiter({ store: createMemoryStore(), secret: TEST_SECRET });
let authDb: AuthDb;
let auth: Auth;
let flows: AuthFlows;
let owner: pg.Pool;
/** Luồng 2FA riêng cho mỗi bộ luồng (cùng auth, bộ giới hạn mới). */
const makeTwoFactor = () =>
  createTwoFactorFlows({
    auth,
    authDb: wrapAuthDb(authDb),
    limiter: freshLimiter(),
    secret: TEST_SECRET,
    workspaceRoles: async () => [],
  });

beforeAll(() => {
  authDb = createTestAuthDb();
  auth = createAuth({
    authDb: wrapAuthDb(authDb),
    notifier: createNotifier({ transport }),
    secret: TEST_SECRET,
    baseURL: BASE_URL,
    appEnv: 'test',
  });
  flows = createAuthFlows({
    auth,
    limiter: freshLimiter(),
    passwordPolicy: localPolicy,
    twoFactor: makeTwoFactor(),
    minResponseMs: 0,
  });
  owner = new pg.Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL, max: 2 });
});
afterAll(async () => {
  await authDb.close();
  await owner.end();
});

const newEmail = () => `${randomUUID()}@Example.Test`;
const mailsTo = (email: string): MailMessage[] =>
  transport.sent.filter((m) => m.to === email.toLowerCase());
const waitForMails = (email: string, count: number) =>
  vi.waitFor(() => expect(mailsTo(email)).toHaveLength(count), { timeout: 5000 });
/** Chờ đủ lâu để một thư (nếu có) kịp được gửi nền, rồi khẳng định KHÔNG có thư. */
const expectNoMail = async (email: string) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(mailsTo(email)).toHaveLength(0);
};
const linkIn = (mail: MailMessage): string => {
  const url = mail.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error('thư không có link');
  return url;
};
/** Bấm link trong thư: gọi thẳng handler của Better Auth, không đi theo chuyển hướng. */
const clickLink = (url: string) => auth.handler(new Request(url, { redirect: 'manual' }));

const userRow = async (email: string) =>
  (
    await owner.query('SELECT id, email_verified, locale FROM core.users WHERE email = $1', [
      email.toLowerCase(),
    ])
  ).rows[0] as { id: string; email_verified: boolean; locale: string } | undefined;

async function registerVerified(email = newEmail(), locale = 'vi') {
  await flows.register({ email, password: PASSWORD, name: 'Linh', locale });
  await waitForMails(email, 1);
  await clickLink(linkIn(mailsTo(email)[0] as MailMessage));
  return email;
}

describe('đăng ký', () => {
  it('email mới → "check_email", đúng 1 thư xác minh theo ngôn ngữ đã chọn, tài khoản chưa xác minh', async () => {
    const email = newEmail();
    const result = await flows.register({ email, password: PASSWORD, name: 'Linh', locale: 'en' });
    expect(result).toEqual({ status: 'check_email' });
    await waitForMails(email, 1);
    const mail = mailsTo(email)[0] as MailMessage;
    expect(mail.subject).toContain('Verify your email');
    expect(linkIn(mail)).toContain('/api/auth/verify-email?token=');
    const row = await userRow(email);
    expect(row).toMatchObject({ email_verified: false, locale: 'en' });
  });

  it('ngôn ngữ lạ → dùng tiếng Việt; thư bằng tiếng Việt', async () => {
    const email = newEmail();
    await flows.register({ email, password: PASSWORD, name: 'Linh', locale: 'fr' });
    await waitForMails(email, 1);
    expect((await userRow(email))?.locale).toBe('vi');
    expect(mailsTo(email)[0]?.subject).toContain('Xác minh email');
  });

  it('dữ liệu sai → "invalid" kèm trường, KHÔNG gửi thư, KHÔNG tạo người dùng', async () => {
    const email = newEmail();
    expect(await flows.register({ email, password: 'ngan', name: 'A', locale: 'vi' })).toEqual({
      status: 'invalid',
      problem: { field: 'password', reason: 'too_short' },
    });
    expect(
      await flows.register({ email, password: 'x'.repeat(129), name: 'A', locale: 'vi' }),
    ).toEqual({ status: 'invalid', problem: { field: 'password', reason: 'too_long' } });
    expect(
      await flows.register({
        email: 'khong-phai-email',
        password: PASSWORD,
        name: 'A',
        locale: 'vi',
      }),
    ).toEqual({ status: 'invalid', problem: { field: 'email', reason: 'invalid' } });
    expect(await flows.register({ email, password: PASSWORD, name: '   ', locale: 'vi' })).toEqual({
      status: 'invalid',
      problem: { field: 'name', reason: 'invalid' },
    });
    await expectNoMail(email);
    expect(await userRow(email)).toBeUndefined();
  });

  it('email đã có tài khoản → kết quả GIỐNG HỆT đăng ký mới; chủ email nhận thư "đã có tài khoản"; không đổi mật khẩu', async () => {
    const email = await registerVerified(newEmail(), 'en');
    const fresh = await flows.register({
      email: newEmail(),
      password: PASSWORD,
      name: 'Khác',
      locale: 'vi',
    });
    const again = await flows.register({
      email,
      password: 'mat-khau-cua-ke-la-1',
      name: 'Kẻ lạ',
      locale: 'vi',
    });
    expect(again).toEqual(fresh);

    await waitForMails(email, 2); // thư xác minh ban đầu + thư "đã có tài khoản"
    const notice = mailsTo(email)[1] as MailMessage;
    expect(notice.subject).toContain('already have an account'); // theo ngôn ngữ của CHỦ tài khoản (en)
    expect(notice.text).toContain(`${BASE_URL}/login`);
    expect(notice.text).toContain(`${BASE_URL}/forgot-password`);
    const { rows } = await owner.query(
      'SELECT count(*)::int AS n FROM core.users WHERE email = $1',
      [email.toLowerCase()],
    );
    expect(rows[0].n).toBe(1);
    const headers = new Headers();
    expect((await flows.signIn({ email, password: PASSWORD, headers })).status).toBe('ok');
    expect((await flows.signIn({ email, password: 'mat-khau-cua-ke-la-1', headers })).status).toBe(
      'invalid_credentials',
    );
  });
});

describe('xác minh email và đăng nhập', () => {
  it('chưa xác minh: đúng mật khẩu → email_not_verified; sai mật khẩu và email lạ → invalid_credentials (không lộ tồn tại)', async () => {
    const email = newEmail();
    await flows.register({ email, password: PASSWORD, name: 'Linh', locale: 'vi' });
    const headers = new Headers();
    expect((await flows.signIn({ email, password: PASSWORD, headers })).status).toBe(
      'email_not_verified',
    );
    expect(
      (await flows.signIn({ email, password: 'sai-mat-khau-hoan-toan', headers })).status,
    ).toBe('invalid_credentials');
    expect((await flows.signIn({ email: newEmail(), password: PASSWORD, headers })).status).toBe(
      'invalid_credentials',
    );
  });

  it('bấm link xác minh → chuyển về callbackURL; sau đó đăng nhập được, nhận cookie phiên và ngôn ngữ', async () => {
    const email = newEmail();
    await flows.register({ email, password: PASSWORD, name: 'Linh', locale: 'en' });
    await waitForMails(email, 1);
    const response = await clickLink(linkIn(mailsTo(email)[0] as MailMessage));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get('location')).toContain('/verify-email?status=ok');
    expect((await userRow(email))?.email_verified).toBe(true);

    const result = await flows.signIn({ email, password: PASSWORD, headers: new Headers() });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.locale).toBe('en');
    const session = result.cookies.find((c) => c.name.endsWith('session_token'));
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(session?.value.length).toBeGreaterThan(40);
  });

  it('token xác minh sai → chuyển về callbackURL kèm error, không xác minh ai', async () => {
    const response = await clickLink(
      `${BASE_URL}/api/auth/verify-email?token=khong-hop-le&callbackURL=${encodeURIComponent('/verify-email?status=ok')}`,
    );
    expect(response.headers.get('location') ?? '').toContain('error=');
  });

  it('gửi lại thư xác minh: cùng kết quả cho email chưa xác minh và email lạ; chỉ email thật nhận thư', async () => {
    const email = newEmail();
    await flows.register({ email, password: PASSWORD, name: 'Linh', locale: 'vi' });
    await waitForMails(email, 1);
    const unknown = newEmail();
    const [real, fake] = [
      await flows.resendVerification({ email }),
      await flows.resendVerification({ email: unknown }),
    ];
    expect(real).toEqual(fake);
    expect(real).toEqual({ status: 'sent_if_exists' });
    await waitForMails(email, 2);
    await expectNoMail(unknown);
  });

  it('đăng nhập: vượt ngưỡng → rate_limited kèm thời gian chờ, và đúng mật khẩu trong lúc bị chặn vẫn bị từ chối', async () => {
    const email = await registerVerified();
    const limited = createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });
    const attempt = (password: string) =>
      limited.signIn({ email, password, headers: new Headers(), ip: '203.0.113.7' });
    for (let i = 0; i < 5; i++)
      expect((await attempt('sai-mat-khau-hoan-toan')).status).toBe('invalid_credentials');
    const blocked = await attempt('sai-mat-khau-hoan-toan');
    expect(blocked).toMatchObject({ status: 'rate_limited' });
    if (blocked.status === 'rate_limited') {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(900);
    }
    expect((await attempt(PASSWORD)).status).toBe('rate_limited'); // đúng mật khẩu cũng không qua
  });

  it('đổi IP không vượt được: 11 lần từ 11 IP khác nhau cho cùng một email vẫn bị chặn bởi xô theo email', async () => {
    const email = await registerVerified();
    const limited = createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });
    const statuses: string[] = [];
    for (let i = 1; i <= 11; i++) {
      const result = await limited.signIn({
        email,
        password: 'sai-mat-khau-hoan-toan',
        headers: new Headers(),
        ip: `198.51.100.${i}`,
      });
      statuses.push(result.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 'invalid_credentials')).toBe(true);
    expect(statuses[10]).toBe('rate_limited');
  });

  it('dev (không có IP): chỉ xô email; trạng thái bị chặn GIỐNG HỆT cho email có thật và email lạ; người khác không bị ảnh hưởng', async () => {
    const real = await registerVerified();
    const unknown = newEmail();
    const limited = createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });
    const lastResult = async (email: string) => {
      let last = await limited.signIn({
        email,
        password: 'sai-mat-khau-hoan-toan',
        headers: new Headers(),
      });
      for (let i = 0; i < 10; i++) {
        last = await limited.signIn({
          email,
          password: 'sai-mat-khau-hoan-toan',
          headers: new Headers(),
        });
      }
      return last;
    };
    const [a, b] = [await lastResult(real), await lastResult(unknown)];
    expect(a.status).toBe('rate_limited');
    expect(b.status).toBe('rate_limited');
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    // không có khóa chung "unknown": email thứ ba không bị chặn
    const other = await registerVerified();
    expect(
      (await limited.signIn({ email: other, password: PASSWORD, headers: new Headers() })).status,
    ).toBe('ok');
  });

  it('đăng nhập thành công xóa bộ đếm: 4 lần sai, 1 lần đúng, rồi lại được thử đủ 5 lần', async () => {
    const email = await registerVerified();
    const limited = createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });
    const attempt = (password: string) =>
      limited.signIn({ email, password, headers: new Headers(), ip: '203.0.113.8' });
    for (let i = 0; i < 4; i++) await attempt('sai-mat-khau-hoan-toan');
    expect((await attempt(PASSWORD)).status).toBe('ok');
    for (let i = 0; i < 5; i++)
      expect((await attempt('sai-mat-khau-hoan-toan')).status).toBe('invalid_credentials');
  });

  it('quên mật khẩu / gửi lại thư / đăng ký bị chặn: trả CÙNG kết quả trung tính và KHÔNG gửi thư thêm', async () => {
    const email = await registerVerified();
    const limited = createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });
    const before = mailsTo(email).length;

    const forgot: unknown[] = [];
    for (let i = 0; i < 5; i++) forgot.push(await limited.requestPasswordReset({ email }));
    expect(new Set(forgot.map((r) => JSON.stringify(r))).size).toBe(1); // kể cả sau khi bị chặn
    await waitForMails(email, before + 3); // chỉ 3 thư (ngưỡng 3 lần/giờ)
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mailsTo(email)).toHaveLength(before + 3);

    const resend: unknown[] = [];
    for (let i = 0; i < 5; i++) resend.push(await limited.resendVerification({ email }));
    expect(new Set(resend.map((r) => JSON.stringify(r))).size).toBe(1);

    const fresh = newEmail();
    const registers: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      registers.push(
        await limited.register({ email: fresh, password: PASSWORD, name: 'Linh', locale: 'vi' }),
      );
    }
    expect(new Set(registers.map((r) => JSON.stringify(r))).size).toBe(1);
    await waitForMails(fresh, 3); // ngưỡng đăng ký 3 lần/giờ/email: chỉ 3 thư xác minh/"đã có tài khoản"
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mailsTo(fresh)).toHaveLength(3);
  });

  it('kho giới hạn hỏng: đăng nhập vẫn chạy (dự phòng) và quên mật khẩu/đăng ký KHÔNG gửi thư, đều có cảnh báo không PII', async () => {
    const warnings: unknown[] = [];
    const broken = createRateLimiter({
      store: {
        hit: async () => {
          throw new Error('ECONNREFUSED');
        },
        reset: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
      secret: TEST_SECRET,
      onWarn: (w) => warnings.push(w),
    });
    const degraded = createAuthFlows({
      auth,
      limiter: broken,
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });
    const email = await registerVerified();
    const before = mailsTo(email).length;
    expect(
      (await degraded.signIn({ email, password: PASSWORD, headers: new Headers() })).status,
    ).toBe('ok');
    expect(await degraded.requestPasswordReset({ email })).toEqual({ status: 'sent_if_exists' });
    expect(await degraded.resendVerification({ email })).toEqual({ status: 'sent_if_exists' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mailsTo(email)).toHaveLength(before); // không gửi thư
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(warnings)).not.toMatch(/@|ECONNREFUSED|sys:/);
  });

  it('đăng xuất: xóa phiên phía server và trả cookie hết hạn', async () => {
    const email = await registerVerified();
    const signedIn = await flows.signIn({ email, password: PASSWORD, headers: new Headers() });
    if (signedIn.status !== 'ok') throw new Error('đăng nhập thất bại');
    const userId = (await userRow(email))?.id as string;
    expect(
      (await authDb.db.select().from(sessions).where(eq(sessions.userId, userId))).length,
    ).toBe(1);

    const cookie = signedIn.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const cleared = await flows.signOut(new Headers({ cookie }));
    expect(cleared.some((c) => c.name.endsWith('session_token') && c.maxAge === 0)).toBe(true);
    expect(
      (await authDb.db.select().from(sessions).where(eq(sessions.userId, userId))).length,
    ).toBe(0);
  });
});

describe('quên và đặt lại mật khẩu', () => {
  it('email lạ và email thật → CÙNG kết quả; chỉ email thật nhận thư (có link đặt lại)', async () => {
    const email = await registerVerified(newEmail(), 'en');
    const before = mailsTo(email).length;
    const unknown = newEmail();
    const [real, fake] = [
      await flows.requestPasswordReset({ email }),
      await flows.requestPasswordReset({ email: unknown }),
    ];
    expect(real).toEqual({ status: 'sent_if_exists' });
    expect(fake).toEqual(real);
    await waitForMails(email, before + 1);
    const mail = mailsTo(email).at(-1) as MailMessage;
    expect(mail.subject).toContain('Reset your password');
    expect(linkIn(mail)).toContain('/api/auth/reset-password/');
    await expectNoMail(unknown);
  });

  it('email sai định dạng → invalid (không phải thông tin về tài khoản)', async () => {
    expect(await flows.requestPasswordReset({ email: 'abc' })).toEqual({
      status: 'invalid',
      problem: { field: 'email', reason: 'invalid' },
    });
  });

  async function requestResetToken(email: string): Promise<string> {
    const before = mailsTo(email).length;
    await flows.requestPasswordReset({ email });
    await waitForMails(email, before + 1);
    const response = await clickLink(linkIn(mailsTo(email).at(-1) as MailMessage));
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/reset-password?token=');
    return new URL(location, BASE_URL).searchParams.get('token') as string;
  }

  it('đặt lại: đổi mật khẩu, mật khẩu cũ hết dùng, mọi phiên cũ bị thu hồi, token dùng được đúng một lần', async () => {
    const email = await registerVerified();
    const signedIn = await flows.signIn({ email, password: PASSWORD, headers: new Headers() });
    expect(signedIn.status).toBe('ok');
    const userId = (await userRow(email))?.id as string;
    expect(
      (await authDb.db.select().from(sessions).where(eq(sessions.userId, userId))).length,
    ).toBe(1);

    const token = await requestResetToken(email);
    expect(await flows.resetPassword({ token, newPassword: 'mat-khau-moi-rat-dai-1' })).toEqual({
      status: 'ok',
    });

    const headers = new Headers();
    expect((await flows.signIn({ email, password: PASSWORD, headers })).status).toBe(
      'invalid_credentials',
    );
    expect(
      (await flows.signIn({ email, password: 'mat-khau-moi-rat-dai-1', headers })).status,
    ).toBe('ok');
    // phiên cũ đã bị thu hồi; chỉ còn phiên của lần đăng nhập mới ngay trên
    expect(
      (await authDb.db.select().from(sessions).where(eq(sessions.userId, userId))).length,
    ).toBe(1);

    expect(await flows.resetPassword({ token, newPassword: 'mat-khau-khac-nua-12' })).toEqual({
      status: 'invalid_token',
    });
  });

  it('token sai hoặc hết hạn → invalid_token; mật khẩu mới quá ngắn → invalid (token chưa bị tiêu)', async () => {
    const email = await registerVerified();
    expect(await flows.resetPassword({ token: 'khong-hop-le', newPassword: PASSWORD })).toEqual({
      status: 'invalid_token',
    });
    expect(await flows.resetPassword({ token: '', newPassword: PASSWORD })).toEqual({
      status: 'invalid_token',
    });

    const token = await requestResetToken(email);
    expect(await flows.resetPassword({ token, newPassword: 'ngan' })).toEqual({
      status: 'invalid',
      problem: { field: 'password', reason: 'too_short' },
    });
    await owner.query(
      "UPDATE core.verifications SET expires_at = now() - interval '1 minute' WHERE identifier LIKE 'reset-password:%' AND value = $1",
      [(await userRow(email))?.id],
    );
    expect(await flows.resetPassword({ token, newPassword: 'mat-khau-moi-rat-dai-1' })).toEqual({
      status: 'invalid_token',
    });
    expect((await flows.signIn({ email, password: PASSWORD, headers: new Headers() })).status).toBe(
      'ok',
    );
  });
});

describe('thời gian phản hồi (chống dò email qua thời gian)', () => {
  it('đăng ký, gửi lại thư, quên mật khẩu: email lạ và email có thật đều chờ ít nhất ngưỡng tối thiểu', async () => {
    const slow = createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: localPolicy,
      twoFactor: makeTwoFactor(),
      minResponseMs: 300,
    });
    const existing = await registerVerified();
    const timed = async (run: () => Promise<unknown>) => {
      const start = performance.now();
      await run();
      return performance.now() - start;
    };
    const durations = await Promise.all([
      timed(() => slow.requestPasswordReset({ email: existing })),
      timed(() => slow.requestPasswordReset({ email: newEmail() })),
      timed(() => slow.resendVerification({ email: existing })),
      timed(() => slow.resendVerification({ email: newEmail() })),
      timed(() =>
        slow.register({ email: existing, password: PASSWORD, name: 'Kẻ lạ', locale: 'vi' }),
      ),
      timed(() =>
        slow.register({ email: newEmail(), password: PASSWORD, name: 'Mới', locale: 'vi' }),
      ),
    ]);
    for (const ms of durations) expect(ms).toBeGreaterThanOrEqual(295);
    // và không chậm vô hạn: nhánh nào cũng nằm trong cùng một khoảng hẹp quanh ngưỡng
    for (const ms of durations) expect(ms).toBeLessThan(2500);
  });
});

describe('log của Better Auth không chứa email thô', () => {
  it('đường email lạ / email trùng không ghi "@" vào log hay console', async () => {
    const entries: Array<{ level: string; message: string }> = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      const probe = createAuth({
        authDb: wrapAuthDb(authDb),
        notifier: createNotifier({ transport: createMemoryTransport() }),
        secret: TEST_SECRET,
        baseURL: BASE_URL,
        appEnv: 'test',
        logger: (entry) => entries.push(entry),
      });
      const probeFlows = createAuthFlows({
        auth: probe,
        limiter: freshLimiter(),
        passwordPolicy: localPolicy,
        twoFactor: makeTwoFactor(),
        minResponseMs: 0,
      });
      const existing = await registerVerified();
      await probeFlows.requestPasswordReset({ email: newEmail() });
      await probeFlows.register({
        email: existing,
        password: PASSWORD,
        name: 'Trùng',
        locale: 'vi',
      });
      await probeFlows.signIn({ email: newEmail(), password: PASSWORD, headers: new Headers() });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const printed = spies.flatMap((spy) =>
        spy.mock.calls.map((call) => call.map(String).join(' ')),
      );
      for (const text of [...entries.map((e) => e.message), ...printed]) {
        expect(text).not.toContain('@');
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('mật khẩu đã lộ / quá phổ biến (ADR 004 §3)', () => {
  const sha1 = (text: string) =>
    createHash('sha1').update(text, 'utf8').digest('hex').toUpperCase();
  const pwnedPassword = `Mk-${randomUUID()}-Pw1!`;
  /** HIBP giả: trả về hậu tố của đúng `pwnedPassword` khi tiền tố khớp; ghi lại mọi URL được gọi. */
  const calls: string[] = [];
  const fakeHibp = (async (url: string) => {
    calls.push(url);
    const lines = ['0018A45C4D1DEF81644B54AB7F969B88D65:3'];
    if (url.endsWith(sha1(pwnedPassword).slice(0, 5)))
      lines.push(`${sha1(pwnedPassword).slice(5)}:99`);
    return new Response(lines.join('\r\n'));
  }) as unknown as typeof fetch;
  const withHibp = (fetchImpl: typeof fetch) =>
    createAuthFlows({
      auth,
      limiter: freshLimiter(),
      passwordPolicy: createPasswordPolicy({ fetchImpl }),
      twoFactor: makeTwoFactor(),
      minResponseMs: 0,
    });

  it('đăng ký với mật khẩu phổ biến → invalid "common", KHÔNG tạo người dùng, KHÔNG gửi thư', async () => {
    const email = newEmail();
    expect(
      await flows.register({ email, password: 'qwertyuiop', name: 'Linh', locale: 'vi' }),
    ).toEqual({
      status: 'invalid',
      problem: { field: 'password', reason: 'common' },
    });
    await expectNoMail(email);
    expect(await userRow(email)).toBeUndefined();
  });

  it('đăng ký với mật khẩu có trong HIBP → invalid "pwned"; không tạo người dùng, không gửi thư; chỉ tiền tố SHA-1 rời máy', async () => {
    const email = newEmail();
    calls.length = 0;
    const result = await withHibp(fakeHibp).register({
      email,
      password: pwnedPassword,
      name: 'Linh',
      locale: 'vi',
    });
    expect(result).toEqual({ status: 'invalid', problem: { field: 'password', reason: 'pwned' } });
    await expectNoMail(email);
    expect(await userRow(email)).toBeUndefined();
    expect(calls).toEqual([
      `https://api.pwnedpasswords.com/range/${sha1(pwnedPassword).slice(0, 5)}`,
    ]);
  });

  it('HIBP sập/timeout → vẫn đăng ký được (cho qua + cảnh báo)', async () => {
    const email = newEmail();
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(
      await withHibp(down).register({
        email,
        password: `Mk-${randomUUID()}-Nw1!`,
        name: 'Linh',
        locale: 'vi',
      }),
    ).toEqual({ status: 'check_email' });
    await waitForMails(email, 1);
  });

  it('kết quả bị từ chối KHÔNG phụ thuộc email có tồn tại hay không (đăng ký email có thật và email lạ đều "pwned")', async () => {
    const existing = await registerVerified();
    const hibp = withHibp(fakeHibp);
    const [a, b] = [
      await hibp.register({ email: existing, password: pwnedPassword, name: 'A', locale: 'vi' }),
      await hibp.register({ email: newEmail(), password: pwnedPassword, name: 'B', locale: 'vi' }),
    ];
    expect(a).toEqual(b);
  });

  it('đặt lại mật khẩu bằng mật khẩu đã lộ → invalid "pwned" và token KHÔNG bị tiêu: đặt lại bằng mật khẩu tốt vẫn được', async () => {
    const email = await registerVerified();
    const before = mailsTo(email).length;
    await flows.requestPasswordReset({ email });
    await waitForMails(email, before + 1);
    const response = await clickLink(linkIn(mailsTo(email).at(-1) as MailMessage));
    const token = new URL(response.headers.get('location') ?? '', BASE_URL).searchParams.get(
      'token',
    ) as string;

    const hibp = withHibp(fakeHibp);
    expect(await hibp.resetPassword({ token, newPassword: pwnedPassword })).toEqual({
      status: 'invalid',
      problem: { field: 'password', reason: 'pwned' },
    });
    expect(await flows.resetPassword({ token, newPassword: 'qwertyuiop' })).toEqual({
      status: 'invalid',
      problem: { field: 'password', reason: 'common' },
    });
    expect(await flows.resetPassword({ token, newPassword: `Mk-${randomUUID()}-Gd1!` })).toEqual({
      status: 'ok',
    });
  });

  it('không kiểm khi đăng nhập: tài khoản có mật khẩu cũ yếu vẫn đăng nhập được', async () => {
    const email = newEmail();
    // tạo tài khoản bằng mật khẩu "yếu" qua chính Better Auth (bỏ qua flows) rồi xác minh
    await auth.api.signUpEmail({ body: { email, password: 'qwertyuiop', name: 'Cũ' } });
    await owner.query('UPDATE core.users SET email_verified = true WHERE email = $1', [
      email.toLowerCase(),
    ]);
    expect(
      (await flows.signIn({ email, password: 'qwertyuiop', headers: new Headers() })).status,
    ).toBe('ok');
  });
});
