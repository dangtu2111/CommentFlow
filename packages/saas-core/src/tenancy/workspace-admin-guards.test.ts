import type { FlowDb } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import type { Notifier } from '../notify/notifier';
import type { RateLimiter } from '../ratelimit/limiter';
import { createWorkspaceAdmin, hashInvitationToken } from './workspace-admin';

const WS = '22222222-2222-4222-8222-222222222222';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const BAD = 'khong-phai-uuid';

/** Truy vấn giả: mỗi lần `select` lấy MỘT tập dòng kế tiếp trong hàng đợi; await ra tập đó. */
function fakeTx(selects: unknown[][]) {
  const queue = [...selects];
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = Promise.resolve(rows) as never;
    for (const m of ['from', 'where', 'innerJoin', 'orderBy', 'limit']) q[m] = () => q;
    return q;
  };
  return { select: vi.fn(() => chain(queue.shift() ?? [])) };
}

function setup(options: { selects?: unknown[][]; actorError?: unknown } = {}) {
  const tx = fakeTx(options.selects ?? []);
  const withActor = vi.fn(async (_w: string, _a: string, fn: (t: unknown) => unknown) => {
    if (options.actorError) throw options.actorError;
    return fn(tx);
  });
  const db = { withActor, withWorkspace: vi.fn(), withUser: vi.fn() } as unknown as FlowDb;
  const admin = createWorkspaceAdmin({
    db,
    notifier: { send: vi.fn() } as unknown as Notifier,
    limiter: {} as RateLimiter,
    appUrl: 'https://app.example.vn///',
  });
  return { admin, withActor, tx };
}

describe('workspace-admin: kiểm đầu vào (không chạm DB)', () => {
  it('từ chối id/vai trò/trạng thái sai định dạng', async () => {
    const { admin, withActor } = setup();
    const ok = { workspaceId: WS, actorUserId: ACTOR, memberId: MEMBER };
    const invalid = { code: 'VALIDATION_FAILED' };
    await expect(admin.listMembers({ workspaceId: BAD, actorUserId: ACTOR })).rejects.toMatchObject(
      invalid,
    );
    await expect(
      admin.changeMemberRole({ ...ok, memberId: BAD, role: 'staff' }),
    ).rejects.toMatchObject(invalid);
    await expect(admin.changeMemberRole({ ...ok, role: 'admin' as never })).rejects.toMatchObject(
      invalid,
    );
    await expect(admin.setMemberStatus({ ...ok, status: 'banned' as never })).rejects.toMatchObject(
      invalid,
    );
    await expect(admin.leaveWorkspace({ workspaceId: WS, userId: BAD })).rejects.toMatchObject(
      invalid,
    );
    await expect(
      admin.createInvitation({
        workspaceId: WS,
        actorUserId: ACTOR,
        email: 'khong-phai-email',
        role: 'staff',
      } as never),
    ).rejects.toMatchObject(invalid);
    await expect(
      admin.revokeInvitation({ workspaceId: WS, actorUserId: ACTOR, invitationId: BAD }),
    ).rejects.toMatchObject(invalid);
    await expect(
      admin.resendInvitation({ workspaceId: WS, actorUserId: ACTOR, invitationId: BAD }),
    ).rejects.toMatchObject(invalid);
    expect(withActor).not.toHaveBeenCalled();
  });
});

describe('workspace-admin: quyền Owner', () => {
  it('người không phải Owner đổi vai trò → FORBIDDEN', async () => {
    const { admin } = setup({ selects: [[{ role: 'staff' }]] });
    await expect(
      admin.changeMemberRole({
        workspaceId: WS,
        actorUserId: ACTOR,
        memberId: MEMBER,
        role: 'owner',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Owner nhưng memberId không thuộc workspace → NOT_FOUND (không lộ tồn tại)', async () => {
    const { admin } = setup({ selects: [[{ role: 'owner' }], []] });
    await expect(
      admin.changeMemberRole({
        workspaceId: WS,
        actorUserId: ACTOR,
        memberId: MEMBER,
        role: 'staff',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lỗi RLS (42501) từ DB được đổi thành FORBIDDEN; lỗi khác nổi lên nguyên dạng', async () => {
    const rls = { code: '42501', message: 'violates row-level security policy' };
    const denied = setup({ actorError: rls });
    await expect(
      denied.admin.changeMemberRole({
        workspaceId: WS,
        actorUserId: ACTOR,
        memberId: MEMBER,
        role: 'staff',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const boom = new Error('mất kết nối');
    const broken = setup({ actorError: boom });
    await expect(
      broken.admin.changeMemberRole({
        workspaceId: WS,
        actorUserId: ACTOR,
        memberId: MEMBER,
        role: 'staff',
      }),
    ).rejects.toBe(boom);
  });
});

describe('hashInvitationToken', () => {
  it('SHA-256 hex, ổn định và khác nhau theo token', () => {
    expect(hashInvitationToken('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken('a')).toBe(hashInvitationToken('a'));
    expect(hashInvitationToken('a')).not.toBe(hashInvitationToken('b'));
  });
});
