import type { FlowDb } from '@flow/db/runtime';
import { isAppError } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Notifier } from '../notify/notifier';
import type { RateLimiter } from '../ratelimit/limiter';
import { createWorkspaceAdmin } from './workspace-admin';

/**
 * Test ĐƠN VỊ của `leaveWorkspace` (MEMBER-LEAVE) bằng DB giả: không cần database. Logic thật (khóa tư vấn, trigger Owner
 * cuối, RLS) được kiểm bằng test tích hợp `workspace-members.int.test.ts` + `packages/db/tests/member-leave.int.test.ts`.
 */
const WS = '11111111-1111-4111-8111-111111111111';
const LEAVER = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333';

type Person = { userId: string; name: string; email: string; locale: string };
const person = (userId: string, name: string): Person => ({
  userId,
  name,
  email: `${name}@example.test`,
  locale: 'vi',
});

/** Truy vấn select() của Drizzle là chuỗi gọi nối đuôi rồi `await`: trả lần lượt các kết quả đã xếp hàng. */
function chain(rows: unknown[]) {
  const proxy: unknown = new Proxy(() => undefined, {
    get: (_t, prop) =>
      prop === 'then' ? (resolve: (value: unknown[]) => unknown) => resolve(rows) : () => proxy,
  });
  return proxy;
}

function setup(options: { selects: unknown[][]; execute?: () => Promise<unknown> }) {
  const queue = [...options.selects];
  const execute = vi.fn(options.execute ?? (async () => ({ rows: [{ left_role: 'staff' }] })));
  const tx = { select: vi.fn(() => chain(queue.shift() ?? [])), execute };
  const withActor = vi.fn(async (_ws: string, _user: string, fn: (t: typeof tx) => unknown) =>
    fn(tx),
  );
  const sendInBackground = vi.fn();
  const admin = createWorkspaceAdmin({
    db: { withActor } as unknown as FlowDb,
    notifier: { sendInBackground } as unknown as Notifier,
    limiter: {} as RateLimiter,
    appUrl: 'https://app.example.test/',
  });
  return { admin, withActor, execute, sendInBackground };
}

const happyPath = [
  [{ name: 'Shop An', defaultLang: 'vi' }], // workspaceInfo
  [person(LEAVER, 'Hà')], // người rời
  [person(OWNER, 'Minh'), person(LEAVER, 'Hà')], // Owner (lọc bỏ người rời)
];

const codeOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : error;
  }
  return undefined;
};

describe('leaveWorkspace (đơn vị, DB giả)', () => {
  it('Staff rời: gọi hàm DB trong withActor của chính người đó, báo mọi Owner còn lại (không báo người rời)', async () => {
    const { admin, withActor, execute, sendInBackground } = setup({ selects: happyPath });
    await admin.leaveWorkspace({ workspaceId: WS, userId: LEAVER });
    expect(withActor).toHaveBeenCalledWith(WS, LEAVER, expect.any(Function));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sendInBackground).toHaveBeenCalledTimes(1);
    const [to, mail] = sendInBackground.mock.calls[0] ?? [];
    expect(to).toMatchObject({ email: 'Minh@example.test' });
    expect(mail).toMatchObject({
      kind: 'owner-change',
      change: 'left',
      workspaceName: 'Shop An',
      targetName: 'Hà',
      url: 'https://app.example.test/app/members',
    });
  });

  it('Owner cuối cùng: DB báo members_last_owner → CONFLICT, không gửi thư', async () => {
    const lastOwner = Object.assign(new Error('last_owner'), {
      code: '23514',
      constraint: 'members_last_owner',
    });
    const { admin, sendInBackground } = setup({
      selects: happyPath,
      execute: async () => {
        throw lastOwner;
      },
    });
    expect(await codeOf(admin.leaveWorkspace({ workspaceId: WS, userId: LEAVER }))).toBe(
      'CONFLICT',
    );
    expect(sendInBackground).not.toHaveBeenCalled();
  });

  it('không còn là thành viên (CF404) → NOT_FOUND', async () => {
    const { admin, sendInBackground } = setup({
      selects: happyPath,
      execute: async () => {
        throw Object.assign(new Error('not_a_member'), { code: 'CF404' });
      },
    });
    expect(await codeOf(admin.leaveWorkspace({ workspaceId: WS, userId: LEAVER }))).toBe(
      'NOT_FOUND',
    );
    expect(sendInBackground).not.toHaveBeenCalled();
  });

  it('lỗi khác được ném lại nguyên dạng (không bị nuốt hay đổi mã)', async () => {
    const boom = Object.assign(new Error('boom'), { code: '08006' });
    const { admin } = setup({
      selects: happyPath,
      execute: async () => {
        throw boom;
      },
    });
    expect(await codeOf(admin.leaveWorkspace({ workspaceId: WS, userId: LEAVER }))).toBe(boom);
  });

  it('id không hợp lệ → VALIDATION_FAILED, không chạm DB', async () => {
    const { admin, withActor } = setup({ selects: [] });
    expect(await codeOf(admin.leaveWorkspace({ workspaceId: 'x', userId: LEAVER }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await codeOf(admin.leaveWorkspace({ workspaceId: WS, userId: 'y' }))).toBe(
      'VALIDATION_FAILED',
    );
    expect(withActor).not.toHaveBeenCalled();
  });
});
