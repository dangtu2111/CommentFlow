import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthDb } from '@flow/db/auth-db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Auth,
  type AuthFlows,
  type CookieSpec,
  createAuth,
  createAuthFlows,
  createPasswordPolicy,
  createTwoFactorFlows,
  type TwoFactorFlows,
} from '../src/auth';
import { wrapAuthDb } from '../src/auth/auth-db';
import { createMemoryTransport, createNotifier } from '../src/notify';
import { createMemoryStore, createRateLimiter } from '../src/ratelimit';
import { createTenancy } from '../src/tenancy';
import { createTestAuthDb, createTestDb } from './helpers';
import { totp, wrongCode } from './totp';

const SECRET = randomBytes(32).toString('hex');
let authDb: AuthDb;
let auth: Auth;
let flows: AuthFlows;
let twoFactor: TwoFactorFlows;
let owner: pg.Pool;
let tenancy: ReturnType<typeof createTenancy>;
/** Vai trò workspace của người dùng (thật, qua RLS) — test gán bằng cách tạo workspace/thành viên. */
const rolesOf = async (userId: string) =>
  (await tenancy.listWorkspacesOfUser(userId)).map((w) => w.role);

beforeAll(() => {
  authDb = createTestAuthDb();
  auth = createAuth({
    authDb: wrapAuthDb(authDb),
    notifier: createNotifier({ transport: createMemoryTransport() }),
    secret: SECRET,
    baseURL: 'http://localhost:3000',
    appEnv: 'test',
  });
  const limiter = createRateLimiter({ store: createMemoryStore(), secret: SECRET });
  tenancy = createTenancy(createTestDb());
  twoFactor = createTwoFactorFlows({
    auth,
    authDb: wrapAuthDb(authDb),
    limiter,
    secret: SECRET,
    workspaceRoles: rolesOf,
  });
  flows = createAuthFlows({
    auth,
    limiter,
    passwordPolicy: createPasswordPolicy({ pwnedEnabled: false }),
    twoFactor,
    minResponseMs: 0,
  });
  owner = new pg.Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL, max: 2 });
});
afterAll(async () => {
  await authDb.close();
  await owner.end();
});

/** Cookie của trình duyệt giả lập: bỏ cookie đã bị xóa (maxAge 0 / rỗng), ghi đè theo tên. */
class Jar {
  private readonly values = new Map<string, string>();
  apply(cookies: CookieSpec[]): this {
    for (const cookie of cookies) {
      if (cookie.maxAge === 0 || cookie.value === '') this.values.delete(cookie.name);
      else this.values.set(cookie.name, cookie.value);
    }
    return this;
  }
  has(partOfName: string): boolean {
    return [...this.values.keys()].some((name) => name.includes(partOfName));
  }
  get headers(): Headers {
    return new Headers({
      cookie: [...this.values].map(([name, value]) => `${name}=${value}`).join('; '),
    });
  }
}

const sessionCount = async (userId: string) =>
  (await owner.query('SELECT count(*)::int AS n FROM core.sessions WHERE user_id = $1', [userId]))
    .rows[0].n as number;

async function newUser(): Promise<{ email: string; password: string; userId: string }> {
  const email = `${randomUUID()}@example.test`;
  const password = `Mk-${randomUUID()}-Zz1!`;
  const registered = await auth.api.signUpEmail({ body: { email, password, name: 'Người thử' } });
  await owner.query('UPDATE core.users SET email_verified = true WHERE id = $1', [
    registered.user.id,
  ]);
  return { email, password, userId: registered.user.id };
}

async function login(user: { email: string; password: string }): Promise<Jar> {
  const result = await flows.signIn({ ...user, headers: new Headers() });
  if (result.status !== 'ok') throw new Error(`đăng nhập thất bại: ${result.status}`);
  return new Jar().apply(result.cookies);
}

/** Người dùng đã bật 2FA xong; trả secret (đóng vai ứng dụng xác thực) và mã dự phòng. */
async function userWithTwoFactor() {
  const user = await newUser();
  const jar = await login(user);
  const begin = await twoFactor.beginEnrollment({ password: user.password, headers: jar.headers });
  if (begin.status !== 'ok') throw new Error('không bắt đầu được bật 2FA');
  const confirm = await twoFactor.confirmEnrollment({
    code: totp(begin.manualKey),
    headers: jar.headers,
  });
  if (confirm.status !== 'ok') throw new Error('không xác nhận được 2FA');
  return { ...user, totpKey: begin.manualKey, backupCodes: begin.backupCodes };
}

describe('bật 2FA', () => {
  it('sai mật khẩu → wrong_password; đúng → QR do server tạo + khóa nhập tay + 10 mã dự phòng; CHƯA bật cho đến khi nhập mã đúng', async () => {
    const user = await newUser();
    const jar = await login(user);
    expect(
      await twoFactor.beginEnrollment({ password: 'sai-mat-khau-hoan-toan', headers: jar.headers }),
    ).toEqual({ status: 'wrong_password' });

    const begin = await twoFactor.beginEnrollment({
      password: user.password,
      headers: jar.headers,
    });
    if (begin.status !== 'ok') throw new Error(begin.status);
    expect(begin.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(begin.manualKey).toMatch(/^[A-Z2-7]+$/);
    expect(begin.backupCodes).toHaveLength(10);
    expect(new Set(begin.backupCodes).size).toBe(10);
    const before = await owner.query('SELECT totp_enabled FROM core.users WHERE id = $1', [
      user.userId,
    ]);
    expect(before.rows[0].totp_enabled).toBe(false);

    expect(
      await twoFactor.confirmEnrollment({
        code: wrongCode(begin.manualKey),
        headers: jar.headers,
      }),
    ).toEqual({ status: 'invalid_code' });
    expect(
      (await owner.query('SELECT totp_enabled FROM core.users WHERE id = $1', [user.userId]))
        .rows[0].totp_enabled,
    ).toBe(false);

    expect(
      await twoFactor.confirmEnrollment({ code: totp(begin.manualKey), headers: jar.headers }),
    ).toMatchObject({ status: 'ok' });
    expect(
      (await owner.query('SELECT totp_enabled FROM core.users WHERE id = $1', [user.userId]))
        .rows[0].totp_enabled,
    ).toBe(true);
  });

  it('secret và mã dự phòng trong DB là bản MÃ HÓA (không chứa mã thô)', async () => {
    const user = await userWithTwoFactor();
    const row = (
      await owner.query('SELECT secret, backup_codes FROM core.two_factors WHERE user_id = $1', [
        user.userId,
      ])
    ).rows[0];
    expect(row.secret).not.toContain(user.totpKey);
    for (const code of user.backupCodes) expect(row.backup_codes).not.toContain(code);
  });

  it('chưa đăng nhập → unauthenticated; đã bật rồi thì không bật lại', async () => {
    expect(
      await twoFactor.beginEnrollment({ password: 'x'.repeat(12), headers: new Headers() }),
    ).toEqual({ status: 'unauthenticated' });
    const user = await userWithTwoFactor();
    const jar = await login(user).catch(() => null);
    expect(jar).toBeNull(); // bật 2FA rồi thì đăng nhập thường không cấp phiên (xem nhóm dưới)
  });
});

describe('đăng nhập khi đã bật 2FA', () => {
  it('đúng mật khẩu nhưng chưa nhập mã → two_factor_required, KHÔNG có phiên, KHÔNG thêm dòng sessions', async () => {
    const user = await userWithTwoFactor();
    const before = await sessionCount(user.userId);
    const result = await flows.signIn({ ...user, headers: new Headers() });
    if (result.status !== 'two_factor_required') throw new Error(result.status);
    const jar = new Jar().apply(result.cookies);
    expect(jar.has('session_token')).toBe(false);
    expect(jar.has('cf-2fa-pending')).toBe(true);
    expect(await auth.api.getSession({ headers: jar.headers })).toBeNull();
    expect(await sessionCount(user.userId)).toBe(before);
    expect(twoFactor.hasPending(jar.headers)).toBe(true);
  });

  it('mã đúng → có phiên dùng được, cookie chờ bị xóa; mã sai → invalid_code và vẫn chưa có phiên', async () => {
    const user = await userWithTwoFactor();
    const signIn = await flows.signIn({ ...user, headers: new Headers() });
    if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
    const jar = new Jar().apply(signIn.cookies);

    expect(
      await twoFactor.verifyLogin({
        code: wrongCode(user.totpKey),
        kind: 'totp',
        headers: jar.headers,
      }),
    ).toEqual({ status: 'invalid_code' });
    expect(await auth.api.getSession({ headers: jar.headers })).toBeNull();

    const ok = await twoFactor.verifyLogin({
      code: ` ${totp(user.totpKey)} `,
      kind: 'totp',
      headers: jar.headers,
    });
    if (ok.status !== 'ok') throw new Error(ok.status);
    jar.apply(ok.cookies);
    expect(jar.has('cf-2fa-pending')).toBe(false);
    expect(ok.locale).toBe('vi');
    const session = await auth.api.getSession({ headers: jar.headers });
    expect(session?.user.id).toBe(user.userId);
  });

  it('mã dự phòng dùng được ĐÚNG MỘT lần', async () => {
    const user = await userWithTwoFactor();
    const code = user.backupCodes[0] as string;
    const first = await flows.signIn({ ...user, headers: new Headers() });
    if (first.status !== 'two_factor_required') throw new Error(first.status);
    const ok = await twoFactor.verifyLogin({
      code,
      kind: 'backup',
      headers: new Jar().apply(first.cookies).headers,
    });
    expect(ok.status).toBe('ok');

    const second = await flows.signIn({ ...user, headers: new Headers() });
    if (second.status !== 'two_factor_required') throw new Error(second.status);
    expect(
      await twoFactor.verifyLogin({
        code,
        kind: 'backup',
        headers: new Jar().apply(second.cookies).headers,
      }),
    ).toEqual({ status: 'invalid_code' });
  });

  it('không có cookie chờ / cookie chờ giả / chỉ có cookie của plugin → expired (không cấp phiên)', async () => {
    const user = await userWithTwoFactor();
    const signIn = await flows.signIn({ ...user, headers: new Headers() });
    if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
    const full = new Jar().apply(signIn.cookies);
    const code = totp(user.totpKey);

    expect(await twoFactor.verifyLogin({ code, kind: 'totp', headers: new Headers() })).toEqual({
      status: 'expired',
    });

    const forged = new Jar().apply(signIn.cookies);
    forged.apply([{ name: 'cf-2fa-pending', value: 'abc.def' }]);
    expect(await twoFactor.verifyLogin({ code, kind: 'totp', headers: forged.headers })).toEqual({
      status: 'expired',
    });

    const pluginOnly = new Jar().apply(signIn.cookies.filter((c) => c.name !== 'cf-2fa-pending'));
    expect(
      await twoFactor.verifyLogin({ code, kind: 'totp', headers: pluginOnly.headers }),
    ).toEqual({ status: 'expired' });
    expect(full.has('cf-2fa-pending')).toBe(true);
  });

  it('nhập sai quá 5 lần → rate_limited, kể cả khi mã thứ 6 ĐÚNG; người khác không bị ảnh hưởng', async () => {
    const user = await userWithTwoFactor();
    const other = await userWithTwoFactor();
    const signIn = await flows.signIn({ ...user, headers: new Headers() });
    if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
    const jar = new Jar().apply(signIn.cookies);

    for (let i = 0; i < 5; i++) {
      expect(
        await twoFactor.verifyLogin({
          code: wrongCode(user.totpKey),
          kind: 'totp',
          headers: jar.headers,
        }),
      ).toEqual({ status: 'invalid_code' });
    }
    const blocked = await twoFactor.verifyLogin({
      code: totp(user.totpKey),
      kind: 'totp',
      headers: jar.headers,
    });
    expect(blocked.status).toBe('rate_limited');
    expect(await auth.api.getSession({ headers: jar.headers })).toBeNull();

    const otherSignIn = await flows.signIn({ ...other, headers: new Headers() });
    if (otherSignIn.status !== 'two_factor_required') throw new Error(otherSignIn.status);
    expect(
      (
        await twoFactor.verifyLogin({
          code: totp(other.totpKey),
          kind: 'totp',
          headers: new Jar().apply(otherSignIn.cookies).headers,
        })
      ).status,
    ).toBe('ok');
  });
});

describe('quản lý 2FA trong trang bảo mật', () => {
  async function loggedIn() {
    const user = await userWithTwoFactor();
    const signIn = await flows.signIn({ ...user, headers: new Headers() });
    if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
    const ok = await twoFactor.verifyLogin({
      code: totp(user.totpKey),
      kind: 'totp',
      headers: new Jar().apply(signIn.cookies).headers,
    });
    if (ok.status !== 'ok') throw new Error(ok.status);
    return { ...user, jar: new Jar().apply(signIn.cookies).apply(ok.cookies) };
  }

  it('tạo lại mã dự phòng cần mật khẩu; mã cũ hết hiệu lực', async () => {
    const user = await loggedIn();
    expect(
      await twoFactor.regenerateBackupCodes({
        password: 'sai-hoan-toan',
        headers: user.jar.headers,
      }),
    ).toEqual({ status: 'wrong_password' });
    const fresh = await twoFactor.regenerateBackupCodes({
      password: user.password,
      headers: user.jar.headers,
    });
    if (fresh.status !== 'ok') throw new Error(fresh.status);
    expect(fresh.backupCodes).toHaveLength(10);

    const signIn = await flows.signIn({ ...user, headers: new Headers() });
    if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
    expect(
      await twoFactor.verifyLogin({
        code: user.backupCodes[0] as string,
        kind: 'backup',
        headers: new Jar().apply(signIn.cookies).headers,
      }),
    ).toEqual({ status: 'invalid_code' });
  });

  it('tắt 2FA cần mật khẩu; sau khi tắt đăng nhập thường lại cấp phiên ngay', async () => {
    const user = await loggedIn();
    expect(
      await twoFactor.disable({ password: 'sai-hoan-toan', headers: user.jar.headers }),
    ).toEqual({ status: 'wrong_password' });
    expect(
      await twoFactor.disable({ password: user.password, headers: user.jar.headers }),
    ).toMatchObject({ status: 'ok' });
    expect(
      (
        await owner.query('SELECT count(*)::int AS n FROM core.two_factors WHERE user_id = $1', [
          user.userId,
        ])
      ).rows[0].n,
    ).toBe(0);
    expect((await flows.signIn({ ...user, headers: new Headers() })).status).toBe('ok');
  });

  it('sai mật khẩu quá 5 lần ở trang bảo mật → rate_limited (phiên bị đánh cắp không dò được mật khẩu)', async () => {
    const user = await loggedIn();
    for (let i = 0; i < 5; i++) {
      expect(
        await twoFactor.disable({ password: `sai-${i}-hoan-toan`, headers: user.jar.headers }),
      ).toEqual({ status: 'wrong_password' });
    }
    const blocked = await twoFactor.disable({
      password: user.password,
      headers: user.jar.headers,
    });
    expect(blocked.status).toBe('rate_limited');
  });
});

describe('bắt buộc 2FA cho Owner/Admin (dữ liệu seed chỉ ở cf_test)', () => {
  it('Owner của một workspace: required = true và KHÔNG được tắt 2FA; Staff và người chưa có workspace: required = false', async () => {
    const boss = await userWithTwoFactor();
    await tenancy.createWorkspace({ userId: boss.userId, name: 'Cửa hàng thử' });
    const staff = await userWithTwoFactor();
    const ws = await tenancy.createWorkspace({ userId: boss.userId, name: 'Cửa hàng thử 2' });
    await tenancy.addMember({
      workspaceId: ws.id,
      actorUserId: boss.userId,
      userId: staff.userId,
      role: 'staff',
    });
    const loginAs = async (u: typeof boss) => {
      const signIn = await flows.signIn({ ...u, headers: new Headers() });
      if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
      const ok = await twoFactor.verifyLogin({
        code: totp(u.totpKey),
        kind: 'totp',
        headers: new Jar().apply(signIn.cookies).headers,
      });
      if (ok.status !== 'ok') throw new Error(ok.status);
      return new Jar().apply(signIn.cookies).apply(ok.cookies);
    };
    const bossJar = await loginAs(boss);
    const staffJar = await loginAs(staff);
    expect((await twoFactor.overview(bossJar.headers))?.required).toBe(true);
    expect((await twoFactor.overview(staffJar.headers))?.required).toBe(false);
    expect(await twoFactor.disable({ password: boss.password, headers: bossJar.headers })).toEqual({
      status: 'required',
    });
    expect(
      (await owner.query('SELECT totp_enabled FROM core.users WHERE id = $1', [boss.userId]))
        .rows[0].totp_enabled,
    ).toBe(true);
    expect(
      await twoFactor.disable({ password: staff.password, headers: staffJar.headers }),
    ).toMatchObject({ status: 'ok' });
  });

  it('quản trị nền tảng (is_admin) cũng bắt buộc', async () => {
    const admin = await userWithTwoFactor();
    await owner.query('UPDATE core.users SET is_admin = true WHERE id = $1', [admin.userId]);
    const signIn = await flows.signIn({ ...admin, headers: new Headers() });
    if (signIn.status !== 'two_factor_required') throw new Error(signIn.status);
    const ok = await twoFactor.verifyLogin({
      code: totp(admin.totpKey),
      kind: 'totp',
      headers: new Jar().apply(signIn.cookies).headers,
    });
    if (ok.status !== 'ok') throw new Error(ok.status);
    const jar = new Jar().apply(signIn.cookies).apply(ok.cookies);
    expect((await twoFactor.overview(jar.headers))?.required).toBe(true);
  });
});

describe('cookie chờ gắn với đúng lượt đăng nhập (verifier)', () => {
  it('cookie chờ của tài khoản A ghép với cookie plugin của B (và ngược lại) → expired, không tốn lượt của ai', async () => {
    const a = await userWithTwoFactor();
    const b = await userWithTwoFactor();
    const signA = await flows.signIn({ ...a, headers: new Headers() });
    const signB = await flows.signIn({ ...b, headers: new Headers() });
    if (signA.status !== 'two_factor_required' || signB.status !== 'two_factor_required')
      throw new Error('cần two_factor_required');
    const mixed = new Jar()
      .apply(signB.cookies.filter((c) => c.name !== 'cf-2fa-pending'))
      .apply(signA.cookies.filter((c) => c.name === 'cf-2fa-pending'));
    // 20 lần thử sai với cookie ghép: không lần nào được tính (không bị rate_limited, luôn expired)
    for (let i = 0; i < 20; i++) {
      expect(
        await twoFactor.verifyLogin({
          code: wrongCode(b.totpKey),
          kind: 'totp',
          headers: mixed.headers,
        }),
      ).toEqual({ status: 'expired' });
    }
    // lượt đăng nhập hợp lệ của A vẫn còn đủ 5 lần thử
    const jarA = new Jar().apply(signA.cookies);
    expect(
      await twoFactor.verifyLogin({
        code: wrongCode(a.totpKey),
        kind: 'totp',
        headers: jarA.headers,
      }),
    ).toEqual({ status: 'invalid_code' });
  });
});

describe('phiên còn dùng được sau khi bật/tắt 2FA và đầu vào bất thường (verifier)', () => {
  it('bật rồi tắt 2FA không làm mất phiên hiện tại', async () => {
    const user = await newUser();
    const jar = await login(user);
    const begin = await twoFactor.beginEnrollment({
      password: user.password,
      headers: jar.headers,
    });
    if (begin.status !== 'ok') throw new Error(begin.status);
    const confirmed = await twoFactor.confirmEnrollment({
      code: totp(begin.manualKey),
      headers: jar.headers,
    });
    if (confirmed.status !== 'ok') throw new Error(confirmed.status);
    jar.apply(confirmed.cookies); // plugin xoay phiên: dùng cookie mới
    expect((await auth.api.getSession({ headers: jar.headers }))?.user.id).toBe(user.userId);
    const disabled = await twoFactor.disable({ password: user.password, headers: jar.headers });
    if (disabled.status !== 'ok') throw new Error(disabled.status);
    jar.apply(disabled.cookies);
    expect((await auth.api.getSession({ headers: jar.headers }))?.user.id).toBe(user.userId);
  });

  it('sessionId không phải uuid → false (không lỗi DB); mật khẩu quá dài → wrong_password', async () => {
    const user = await newUser();
    const jar = await login(user);
    expect(await twoFactor.revokeSession({ sessionId: "x'; --", headers: jar.headers })).toBe(
      false,
    );
    expect(
      await twoFactor.beginEnrollment({ password: 'a'.repeat(5000), headers: jar.headers }),
    ).toEqual({ status: 'wrong_password' });
  });
});

describe('danh sách phiên của chính mình', () => {
  const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

  it('chỉ thấy phiên của mình, có trình duyệt/HĐH, đánh dấu phiên hiện tại, KHÔNG có IP/token', async () => {
    const mine = await newUser();
    const theirs = await newUser();
    const jarA = await login(mine);
    await login(mine); // phiên thứ hai của mình
    await login(theirs);
    await owner.query(
      "UPDATE core.sessions SET user_agent = $2, ip = '203.0.113.9' WHERE user_id = $1",
      [mine.userId, CHROME],
    );

    const overview = await twoFactor.overview(jarA.headers);
    expect(overview?.sessions).toHaveLength(2);
    expect(overview?.sessions.filter((s) => s.current)).toHaveLength(1);
    expect(overview?.sessions[0]).toMatchObject({ browser: 'chrome', os: 'windows' });
    const text = JSON.stringify(overview);
    expect(text).not.toContain('203.0.113.9');
    expect(text).not.toMatch(/token/i);
    expect(overview?.twoFactorEnabled).toBe(false);
    expect(await twoFactor.overview(new Headers())).toBeNull();
  });

  it('đăng xuất phiên khác của mình được; phiên của người khác (IDOR) và phiên hiện tại thì không', async () => {
    const mine = await newUser();
    const theirs = await newUser();
    const jarA = await login(mine);
    await login(mine);
    const jarB = await login(theirs);
    const list = (await twoFactor.overview(jarA.headers))?.sessions ?? [];
    const other = list.find((s) => !s.current);
    const current = list.find((s) => s.current);
    const theirSession = (await twoFactor.overview(jarB.headers))?.sessions[0];
    if (!other || !current || !theirSession) throw new Error('thiếu dữ liệu');

    expect(
      await twoFactor.revokeSession({ sessionId: theirSession.id, headers: jarA.headers }),
    ).toBe(false);
    expect(await sessionCount(theirs.userId)).toBe(1);
    expect(await twoFactor.revokeSession({ sessionId: current.id, headers: jarA.headers })).toBe(
      false,
    );
    expect(await twoFactor.revokeSession({ sessionId: other.id, headers: jarA.headers })).toBe(
      true,
    );
    expect(await sessionCount(mine.userId)).toBe(1);
    expect(await twoFactor.revokeSession({ sessionId: other.id, headers: new Headers() })).toBe(
      false,
    );
  });
});
