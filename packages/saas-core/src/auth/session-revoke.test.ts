import { describe, expect, it, vi } from 'vitest';
import type { Auth } from './auth';
import { unwrapAuthDb, wrapAuthDb } from './auth-db';
import { changePasswordAndRevokeAll, revokeAllSessionsOfUser } from './revoke';
import { readSession } from './session';

/** AuthDb giả: transaction chạy callback với tx giả; ghi lại số lần xóa. */
function fakeAuthDb(returned: Array<{ id: string }> = []) {
  const where = vi.fn(() =>
    Object.assign(Promise.resolve(undefined), { returning: async () => returned }),
  );
  const del = vi.fn(() => ({ where }));
  const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({ delete: del }));
  const handle = wrapAuthDb({ transaction, close: async () => undefined } as never);
  return { handle, del, transaction };
}

const NOW = new Date('2026-11-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

function fakeAuth(session: unknown) {
  return {
    api: {
      getSession: vi.fn(async () => session),
      changePassword: vi.fn(async () => undefined),
    },
  } as unknown as Auth;
}

describe('auth-db handle mờ', () => {
  it('unwrap handle không do wrapAuthDb tạo thì báo lỗi', () => {
    expect(() => unwrapAuthDb({ close: async () => undefined })).toThrow(/AuthHandle/);
  });
});

describe('readSession (đơn vị)', () => {
  it('không có phiên → null, không xóa gì', async () => {
    const { handle, transaction } = fakeAuthDb();
    expect(await readSession(fakeAuth(null), handle, new Headers(), NOW)).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('phiên app còn hợp lệ → trả nguyên', async () => {
    const current = { session: { id: 's', createdAt: hoursAgo(100) }, user: { id: 'u' } };
    const { handle, transaction } = fakeAuthDb();
    expect(await readSession(fakeAuth(current), handle, new Headers(), NOW)).toBe(current);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('phiên Admin quá 8 giờ → xóa phiên và trả null (lớp thứ hai)', async () => {
    const current = {
      session: { id: 's', createdAt: hoursAgo(9), isAdminSession: true },
      user: { id: 'u' },
    };
    const { handle, transaction, del } = fakeAuthDb();
    expect(await readSession(fakeAuth(current), handle, new Headers(), NOW)).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('phiên Admin chưa tới 8 giờ → giữ', async () => {
    const current = {
      session: { id: 's', createdAt: hoursAgo(7), isAdminSession: true },
      user: { id: 'u' },
    };
    const { handle } = fakeAuthDb();
    expect(await readSession(fakeAuth(current), handle, new Headers(), NOW)).toBe(current);
  });
});

describe('revoke (đơn vị)', () => {
  it('revokeAllSessionsOfUser trả số phiên đã xóa', async () => {
    const { handle } = fakeAuthDb([{ id: 'a' }, { id: 'b' }]);
    expect(await revokeAllSessionsOfUser(handle, 'u')).toBe(2);
  });

  it('changePasswordAndRevokeAll: chưa đăng nhập → UNAUTHENTICATED, không đổi mật khẩu', async () => {
    const auth = fakeAuth(null);
    const { handle, transaction } = fakeAuthDb();
    await expect(
      changePasswordAndRevokeAll(auth, handle, {
        headers: new Headers(),
        currentPassword: 'a',
        newPassword: 'b',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(auth.api.changePassword).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('changePasswordAndRevokeAll: đổi mật khẩu (revokeOtherSessions) rồi xóa mọi phiên của user', async () => {
    const auth = fakeAuth({ session: { id: 's' }, user: { id: 'u' } });
    const { handle, transaction } = fakeAuthDb([{ id: 's' }]);
    await changePasswordAndRevokeAll(auth, handle, {
      headers: new Headers(),
      currentPassword: 'cu',
      newPassword: 'moi',
    });
    expect(auth.api.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { currentPassword: 'cu', newPassword: 'moi', revokeOtherSessions: true },
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
