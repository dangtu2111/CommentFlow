import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from '@flow/db';
import type { AuthDb } from '@flow/db/auth-db';
import { accounts, sessions, users } from '@flow/db/schema/core';
import { isAppError } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_SECONDS,
  APP_SESSION_SECONDS,
  type Auth,
  changePasswordAndRevokeAll,
  createAuth,
  readSession,
  revokeAllSessionsOfUser,
} from '../src/auth';
import { wrapAuthDb } from '../src/auth/auth-db';
import { createTestAuthDb } from './helpers';

// Khóa ký thử sinh ngẫu nhiên mỗi lần chạy (không có chuỗi cố định trong mã nguồn).
const TEST_SECRET = randomBytes(32).toString('hex');
const PASSWORD = 'mat-khau-dai-du-10';

let authDb: AuthDb;
let authHandle: ReturnType<typeof wrapAuthDb>;
let auth: Auth;
/** Kết nối chủ sở hữu (cf_owner): chỉ để gieo dữ liệu thử mà cf_auth không có quyền sửa (is_admin). */
let owner: pg.Pool;

beforeAll(() => {
  authDb = createTestAuthDb();
  authHandle = wrapAuthDb(authDb);
  auth = createAuth({
    authDb: authHandle,
    secret: TEST_SECRET,
    baseURL: 'http://localhost:3000',
    appEnv: 'test',
  });
  owner = new pg.Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL, max: 2 });
});
afterAll(async () => {
  await authDb.close();
  await owner.end();
});

/** Phiên Admin chỉ tạo/bật được cho người dùng is_admin = true (trigger, migration 0009). */
const makeAdmin = (userId: string) =>
  owner.query("UPDATE core.users SET is_admin = true, admin_role = 'super' WHERE id = $1", [
    userId,
  ]);

const newEmail = () => `${randomUUID()}@Example.Test`;

/** Lấy status dù Better Auth trả Response hay ném APIError. */
async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    const result = await promise;
    return result instanceof Response ? result.status : 200;
  } catch (error) {
    return (error as { statusCode?: number; status?: number }).statusCode ?? 500;
  }
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function signUp(email = newEmail(), password = PASSWORD) {
  const response = (await auth.api.signUpEmail({
    body: { email, password, name: 'Người thử' },
    asResponse: true,
  })) as Response;
  const body = (await response.clone().json()) as { token: string; user: { id: string } };
  return {
    response,
    email,
    userId: body.user.id,
    token: body.token,
    cookie: cookieHeader(response),
  };
}

async function signIn(email: string, password = PASSWORD) {
  const response = (await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  })) as Response;
  return { response, cookie: cookieHeader(response) };
}

const sessionRows = (userId: string) =>
  authDb.db.select().from(sessions).where(eq(sessions.userId, userId));

describe('đăng ký', () => {
  it('từ chối mật khẩu ngắn hơn 10 ký tự và dài hơn 128 ký tự', async () => {
    const short = auth.api.signUpEmail({
      body: { email: newEmail(), password: 'ngan', name: 'A' },
    });
    expect(await statusOf(short)).toBe(400);
    const long = auth.api.signUpEmail({
      body: { email: newEmail(), password: 'x'.repeat(129), name: 'A' },
    });
    expect(await statusOf(long)).toBe(400);
  });

  it('lưu email chữ thường, mật khẩu băm argon2id ở bảng accounts (không phải users)', async () => {
    const { email, userId } = await signUp(newEmail());
    const [user] = await authDb.db.select().from(users).where(eq(users.id, userId));
    expect(user?.email).toBe(email.toLowerCase());
    expect(user?.locale).toBe('vi');
    expect(user?.isAdmin).toBe(false);

    const [account] = await authDb.db.select().from(accounts).where(eq(accounts.userId, userId));
    expect(account?.providerId).toBe('credential');
    expect(account?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(account?.password).not.toContain(PASSWORD);
  });

  it('email đã tồn tại → bị từ chối', async () => {
    const { email } = await signUp();
    const again = auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'B' } });
    expect(await statusOf(again)).toBeGreaterThanOrEqual(400);
  });
});

describe('đăng nhập và phiên', () => {
  it('sai mật khẩu → 401; không tạo phiên mới', async () => {
    const { email, userId } = await signUp();
    const before = (await sessionRows(userId)).length;
    const bad = await signIn(email, 'mat-khau-sai-hoan-toan');
    expect(bad.response.status).toBe(401);
    expect((await sessionRows(userId)).length).toBe(before);
  });

  it('đăng nhập đúng: token lưu thô trong DB, hạn 14 ngày, cookie có chữ ký, không phải phiên Admin', async () => {
    const { email, userId } = await signUp();
    const { response, cookie } = await signIn(email);
    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };

    const rows = await sessionRows(userId);
    const row = rows.find((r) => r.token === token);
    expect(row).toBeDefined();
    expect(row?.isAdminSession).toBe(false);
    const lifetime = (row?.expiresAt.getTime() ?? 0) - Date.now();
    expect(Math.abs(lifetime - APP_SESSION_SECONDS * 1000)).toBeLessThan(60_000);

    // Cookie = token + "." + chữ ký HMAC (ADR 003); không bao giờ chỉ là token trần.
    const value = decodeURIComponent(cookie.split('session_token=')[1]?.split(';')[0] ?? '');
    expect(value.startsWith(`${token}.`)).toBe(true);
    expect(value.length).toBeGreaterThan(token.length + 10);
  });

  it('getSession chấp nhận cookie đúng, từ chối chữ ký bị sửa và token trần không chữ ký', async () => {
    const { email } = await signUp();
    const { cookie } = await signIn(email);
    const ok = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(ok?.user.email).toBe(email.toLowerCase());

    const raw = decodeURIComponent(cookie.split('session_token=')[1] ?? '');
    const [token = ''] = raw.split('.');
    const name = cookie.split('=')[0];
    const tampered = `${name}=${token}.${'A'.repeat(44)}`;
    expect(await auth.api.getSession({ headers: new Headers({ cookie: tampered }) })).toBeNull();
    const unsigned = `${name}=${token}`;
    expect(await auth.api.getSession({ headers: new Headers({ cookie: unsigned }) })).toBeNull();
  });

  it('không có cookie cache: xóa phiên trong DB là mất hiệu lực ngay', async () => {
    const { email, userId } = await signUp();
    const { cookie } = await signIn(email);
    const headers = new Headers({ cookie });
    expect(await auth.api.getSession({ headers })).not.toBeNull();
    await revokeAllSessionsOfUser(authHandle, userId);
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it('mỗi lần đăng nhập tạo phiên và token mới (xoay phiên)', async () => {
    const { email, userId } = await signUp();
    const a = await signIn(email);
    const b = await signIn(email);
    const tokens = (await sessionRows(userId)).map((r) => r.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.length).toBeGreaterThanOrEqual(3); // 1 từ đăng ký + 2 đăng nhập
    expect(a.cookie).not.toBe(b.cookie);
  });

  it('đăng xuất xóa phiên khỏi DB', async () => {
    const { email, userId } = await signUp();
    const { cookie } = await signIn(email);
    const before = (await sessionRows(userId)).length;
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    expect((await sessionRows(userId)).length).toBe(before - 1);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it('phiên hết hạn bị loại', async () => {
    const { email, userId } = await signUp();
    const { cookie } = await signIn(email);
    await authDb.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, userId));
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it('last_seen (updated_at) không bị ghi lại khi chưa quá 1 giờ', async () => {
    const { email, userId } = await signUp();
    const { cookie } = await signIn(email);
    const headers = new Headers({ cookie });
    const before = await sessionRows(userId);
    await auth.api.getSession({ headers });
    await auth.api.getSession({ headers });
    const after = await sessionRows(userId);
    expect(after.map((r) => r.updatedAt.getTime()).sort()).toEqual(
      before.map((r) => r.updatedAt.getTime()).sort(),
    );
  });
});

describe('phiên Admin (is_admin_session)', () => {
  it('hết hạn sau 8 giờ, ngắn hơn phiên app', async () => {
    const { userId } = await signUp();
    await makeAdmin(userId);
    const context = await auth.$context;
    // Tham số thứ 4 (overrideAll = true) bắt buộc: nếu không Better Auth ghi đè bằng giá trị mặc định (false).
    await context.internalAdapter.createSession(userId, false, { isAdminSession: true }, true);
    const rows = await sessionRows(userId);
    const admin = rows.find((r) => r.isAdminSession);
    expect(admin).toBeDefined();
    const lifetime = (admin?.expiresAt.getTime() ?? 0) - Date.now();
    expect(Math.abs(lifetime - ADMIN_SESSION_SECONDS * 1000)).toBeLessThan(60_000);
  });
});

describe('phiên Admin chỉ dành cho người dùng Admin', () => {
  it('tạo phiên Admin cho người dùng thường qua adapter Better Auth bị database từ chối', async () => {
    const { userId } = await signUp();
    const context = await auth.$context;
    await expect(
      context.internalAdapter.createSession(userId, false, { isAdminSession: true }, true),
    ).rejects.toBeDefined();
    const rows = await sessionRows(userId);
    expect(rows.some((r) => r.isAdminSession)).toBe(false);
  });
});

describe('hạn 8 giờ của phiên Admin được ép ở DATABASE (mọi đường đọc/làm mới)', () => {
  const HOUR = 3600 * 1000;

  /** Biến phiên vừa đăng nhập thành phiên Admin đã tạo cách đây N giờ (bằng quyền chủ sở hữu). */
  async function adminSession(createdHoursAgo: number, refreshedHoursAgo: number) {
    const { email, userId } = await signUp();
    await makeAdmin(userId);
    const { cookie } = await signIn(email);
    // Người dùng có 2 phiên (đăng ký + đăng nhập): chọn đúng phiên ứng với cookie theo token.
    const token = decodeURIComponent(cookie.split('session_token=')[1] ?? '').split('.')[0] ?? '';
    const { rows } = await owner.query(
      `UPDATE core.sessions
         SET is_admin_session = true,
             created_at = now() - make_interval(hours => $1::int),
             updated_at = now() - make_interval(hours => $2::int)
       WHERE user_id = $3 AND token = $4
       RETURNING id`,
      [createdHoursAgo, refreshedHoursAgo, userId, token],
    );
    return { cookie, sessionId: rows[0].id as string, headers: new Headers({ cookie }) };
  }

  const rowOf = async (sessionId: string) =>
    (await authDb.db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];

  it('phiên Admin quá 8 giờ kể từ lúc tạo: hết hạn ở mọi đường — gọi thẳng auth.api.getSession và readSession đều null', async () => {
    const { headers } = await adminSession(9, 9);
    expect(await auth.api.getSession({ headers })).toBeNull();
    expect(await readSession(auth, authHandle, headers)).toBeNull();
  });

  it('Better Auth làm mới phiên Admin (+14 ngày) qua auth.api.getSession GỌI THẲNG: DB vẫn cắt về created_at + 8 giờ', async () => {
    const { headers, sessionId } = await adminSession(1, 2); // quá updateAge (1h) → Better Auth làm mới
    const session = await auth.api.getSession({ headers }); // KHÔNG qua readSession
    expect(session).not.toBeNull();
    const row = await rowOf(sessionId);
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(
      (row?.createdAt.getTime() ?? 0) + ADMIN_SESSION_SECONDS * 1000,
    );
  });

  it('cũng đúng khi đi qua bộ xử lý route của Better Auth (/api/auth/get-session)', async () => {
    const { cookie, sessionId } = await adminSession(1, 2);
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/get-session', { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    const row = await rowOf(sessionId);
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(
      (row?.createdAt.getTime() ?? 0) + ADMIN_SESSION_SECONDS * 1000,
    );
  });

  it('hằng số 8 giờ trong SQL khớp ADMIN_SESSION_SECONDS', async () => {
    const { userId } = await signUp();
    await makeAdmin(userId);
    const { rows } = await owner.query(
      `INSERT INTO core.sessions (user_id, token, expires_at, is_admin_session)
       VALUES ($1, $2, now() + interval '14 days', true) RETURNING created_at, expires_at`,
      [userId, randomUUID()],
    );
    expect(rows[0].expires_at.getTime() - rows[0].created_at.getTime()).toBe(
      ADMIN_SESSION_SECONDS * 1000,
    );
  });

  it('phiên app (không Admin) không bị áp trần 8 giờ', async () => {
    const { email, userId } = await signUp();
    const { cookie } = await signIn(email);
    await owner.query(
      "UPDATE core.sessions SET created_at = now() - interval '9 hours' WHERE user_id = $1",
      [userId],
    );
    expect(await readSession(auth, authHandle, new Headers({ cookie }))).not.toBeNull();
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull();
    expect(HOUR).toBeGreaterThan(0);
  });

  it('không có cookie → null', async () => {
    expect(await readSession(auth, authHandle, new Headers())).toBeNull();
  });
});

describe('cookie Secure và appEnv', () => {
  const base = () => ({ authDb: authHandle, secret: TEST_SECRET });

  it('mặc định bật khi baseURL là https, tắt khi http (ở dev/test/ci)', async () => {
    const https = createAuth({ ...base(), baseURL: 'https://app.example.test', appEnv: 'test' });
    const http = createAuth({ ...base(), baseURL: 'http://localhost:3000', appEnv: 'test' });
    expect((await https.$context).options.advanced?.useSecureCookies).toBe(true);
    expect((await http.$context).options.advanced?.useSecureCookies).toBe(false);
  });

  it('chỉ dev/test/ci được tắt Secure; staging/production (và mọi giá trị lạ) → CONFIG_INVALID', () => {
    for (const appEnv of ['dev', 'test', 'ci'] as const) {
      expect(() =>
        createAuth({ ...base(), baseURL: 'http://localhost:3000', appEnv }),
      ).not.toThrow();
    }
    for (const appEnv of ['staging', 'production', 'prod', '', undefined]) {
      expect(() =>
        // @ts-expect-error — appEnv phải thuộc dev|test|ci|staging|production; giá trị lạ vẫn bị chặn lúc chạy
        createAuth({ ...base(), baseURL: 'http://localhost:3000', appEnv }),
      ).toThrow(/Secure|APP_ENV/);
    }
    expect(() =>
      createAuth({ ...base(), baseURL: 'https://app.example.test', appEnv: 'production' }),
    ).not.toThrow();
  });
});

describe('đổi mật khẩu và thu hồi phiên', () => {
  it('revokeAllSessionsOfUser xóa mọi phiên và trả số phiên đã xóa', async () => {
    const { email, userId } = await signUp();
    await signIn(email);
    await signIn(email);
    const count = (await sessionRows(userId)).length;
    expect(await revokeAllSessionsOfUser(authHandle, userId)).toBe(count);
    expect(await sessionRows(userId)).toHaveLength(0);
  });

  it('đổi mật khẩu xóa MỌI phiên (kể cả phiên hiện tại); mật khẩu cũ hết dùng, mới dùng được', async () => {
    const { email, userId } = await signUp();
    await signIn(email);
    const { cookie } = await signIn(email);
    const newPassword = 'mat-khau-moi-dai-du-20';

    await changePasswordAndRevokeAll(auth, authHandle, {
      headers: new Headers({ cookie }),
      currentPassword: PASSWORD,
      newPassword,
    });

    expect(await sessionRows(userId)).toHaveLength(0);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    expect((await signIn(email, PASSWORD)).response.status).toBe(401);
    expect((await signIn(email, newPassword)).response.status).toBe(200);
  });

  it('đổi mật khẩu khi chưa đăng nhập → UNAUTHENTICATED', async () => {
    await expect(
      changePasswordAndRevokeAll(auth, authHandle, {
        headers: new Headers(),
        currentPassword: PASSWORD,
        newPassword: 'mat-khau-moi-dai-du-20',
      }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'UNAUTHENTICATED');
  });
});

describe('cấu hình', () => {
  it('từ chối khóa ký ngắn hơn 32 ký tự', () => {
    expect(() =>
      createAuth({
        authDb: authHandle,
        secret: 'ngan',
        baseURL: 'http://localhost:3000',
        appEnv: 'test',
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('cookie cache tắt và hạn phiên mặc định 14 ngày', async () => {
    const context = await auth.$context;
    expect(context.options.session?.cookieCache?.enabled).toBe(false);
    expect(context.options.session?.expiresIn).toBe(APP_SESSION_SECONDS);
    expect(context.options.session?.updateAge).toBe(3600);
  });
});
