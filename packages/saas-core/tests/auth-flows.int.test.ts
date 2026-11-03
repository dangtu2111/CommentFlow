import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from '@flow/db';
import type { AuthDb } from '@flow/db/auth-db';
import { sessions } from '@flow/db/schema/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Auth, type AuthFlows, createAuth, createAuthFlows } from '../src/auth';
import { wrapAuthDb } from '../src/auth/auth-db';
import { createMemoryTransport, createNotifier, type MailMessage } from '../src/notify';
import { createTestAuthDb } from './helpers';

const BASE_URL = 'http://localhost:3000';
const PASSWORD = 'mat-khau-dai-du-10';
const TEST_SECRET = randomBytes(32).toString('hex');

const transport = createMemoryTransport();
let authDb: AuthDb;
let auth: Auth;
let flows: AuthFlows;
let owner: pg.Pool;

beforeAll(() => {
  authDb = createTestAuthDb();
  auth = createAuth({
    authDb: wrapAuthDb(authDb),
    notifier: createNotifier({ transport }),
    secret: TEST_SECRET,
    baseURL: BASE_URL,
    appEnv: 'test',
  });
  flows = createAuthFlows({ auth });
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

  it('cổng đăng nhập (chừa chỗ rate limit): bị từ chối → rate_limited, KHÔNG gọi Better Auth; nhận email đã chuẩn hóa + ip', async () => {
    const email = await registerVerified();
    const gate = vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 900 });
    const gated = createAuthFlows({ auth, loginGate: gate });
    const result = await gated.signIn({
      email: email.toUpperCase(),
      password: PASSWORD,
      headers: new Headers(),
      ip: '203.0.113.7',
    });
    expect(result).toEqual({ status: 'rate_limited', retryAfterSeconds: 900 });
    expect(gate).toHaveBeenCalledWith({ email: email.toLowerCase(), ip: '203.0.113.7' });
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
