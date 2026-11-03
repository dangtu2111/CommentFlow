import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, type FlowDb } from '@flow/db';
import { actionLogs } from '@flow/db/schema/core';
import { isAppError } from '@flow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryTransport, createNotifier, type MailMessage } from '../src/notify';
import { createMemoryStore, createRateLimiter } from '../src/ratelimit';
import { createTenancy, createWorkspaceAdmin, type WorkspaceAdmin } from '../src/tenancy';
import { adminQuery, createTestDb, createTestUser } from './helpers';

const SECRET = randomBytes(32).toString('hex');
const APP_URL = 'https://app.example.test';

let db: FlowDb;
let tenancy: ReturnType<typeof createTenancy>;
let admin: WorkspaceAdmin;
let transport: ReturnType<typeof createMemoryTransport>;

const fresh = () => {
  transport = createMemoryTransport();
  admin = createWorkspaceAdmin({
    db,
    notifier: createNotifier({ transport }),
    limiter: createRateLimiter({ store: createMemoryStore(), secret: SECRET }),
    appUrl: APP_URL,
  });
};

beforeAll(() => {
  db = createTestDb(10);
  tenancy = createTenancy(db);
  fresh();
});
afterAll(async () => {
  await db.close();
});

/** Thư gửi nền không chờ: đợi đến khi có đủ số thư mong đợi (hoặc hết giờ). */
async function mails(count: number, predicate: (m: MailMessage) => boolean = () => true) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const found = transport.sent.filter(predicate);
    if (found.length >= count) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  return transport.sent.filter(predicate);
}
const settle = () => new Promise((r) => setTimeout(r, 150));

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : `KHÁC: ${String(error)}`;
  }
  return undefined;
};

const person = (name: string) =>
  createTestUser(name, { email: `${randomUUID()}@example.test`, verified: true });
const emailOf = async (userId: string) =>
  (await adminQuery<{ email: string }>('SELECT email FROM core.users WHERE id = $1', [userId]))[0]
    ?.email as string;

/** Workspace có Owner + (tuỳ chọn) các Staff đã là thành viên. */
async function setup(staffCount = 1) {
  fresh();
  const owner = await person('Chủ Shop');
  const ws = await tenancy.createWorkspace({ userId: owner, name: 'Shop thử' });
  const staff: string[] = [];
  for (let i = 0; i < staffCount; i++) {
    const s = await person(`Nhân viên ${i + 1}`);
    await tenancy.addMember({ workspaceId: ws.id, actorUserId: owner, userId: s, role: 'staff' });
    staff.push(s);
  }
  transport.sent.length = 0;
  return { owner, ws, staff };
}

const memberIdOf = async (workspaceId: string, userId: string) =>
  (
    await adminQuery<{ id: string }>(
      'SELECT id FROM core.members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId],
    )
  )[0]?.id as string;

const tokenFrom = (mail: MailMessage): string => {
  const match = mail.text.match(/\/invite\/([A-Za-z0-9_-]{43})/);
  if (!match?.[1]) throw new Error('Thư không có link mời');
  return match[1];
};

const logsOf = (workspaceId: string, action: string) =>
  db.withWorkspace(workspaceId, (tx) =>
    tx
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.workspaceId, workspaceId), eq(actionLogs.action, action))),
  );

describe('thành viên: danh sách, vai trò, trạng thái', () => {
  it('chỉ Owner xem được danh sách; thấy cả thành viên tạm khóa; chỉ các trường cần', async () => {
    const { owner, ws, staff } = await setup(2);
    const [s1, s2] = staff as [string, string];
    expect(await codeOf(admin.listMembers({ workspaceId: ws.id, actorUserId: s1 }))).toBe(
      'FORBIDDEN',
    );
    await admin.setMemberStatus({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberIdOf(ws.id, s2),
      status: 'suspended',
    });
    const rows = await admin.listMembers({ workspaceId: ws.id, actorUserId: owner });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.userId === s2)?.status).toBe('suspended');
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ['email', 'image', 'memberId', 'name', 'role', 'status', 'userId'].sort(),
    );
  });

  it('đổi vai trò ghi action_logs (trước/sau); Staff không đổi được; không tự đổi chính mình', async () => {
    const { owner, ws, staff } = await setup(2);
    const [s1, s2] = staff as [string, string];
    const target = await memberIdOf(ws.id, s1);
    expect(
      await codeOf(
        admin.changeMemberRole({
          workspaceId: ws.id,
          actorUserId: s2,
          memberId: target,
          role: 'owner',
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await codeOf(
        admin.changeMemberRole({
          workspaceId: ws.id,
          actorUserId: owner,
          memberId: await memberIdOf(ws.id, owner),
          role: 'staff',
        }),
      ),
    ).toBe('FORBIDDEN');
    await admin.changeMemberRole({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: target,
      role: 'owner',
    });
    expect(await tenancy.getRole(ws.id, s1)).toBe('owner');
    const logs = await logsOf(ws.id, 'member.role_changed');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: owner,
      targetId: target,
      before: { role: 'staff' },
      after: { role: 'owner' },
    });
  });

  it('thêm/đổi vai trò/gỡ Owner → email báo TẤT CẢ Owner (và người vừa mất vai trò); đổi Staff thì không gửi', async () => {
    const { owner, ws, staff } = await setup(2);
    const [s1, s2] = staff as [string, string];
    // Staff → Staff-không-đổi / Staff khóa: không phải Owner nên không có thư
    await admin.setMemberStatus({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberIdOf(ws.id, s2),
      status: 'suspended',
    });
    await settle();
    expect(transport.sent).toHaveLength(0);

    // Thêm Owner: thư tới cả hai Owner (owner + s1)
    await admin.changeMemberRole({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberIdOf(ws.id, s1),
      role: 'owner',
    });
    const added = await mails(2);
    expect(added.map((m) => m.to).sort()).toEqual([await emailOf(owner), await emailOf(s1)].sort());
    expect(added[0]?.text).toContain('Shop thử');

    // Hạ Owner: thư tới Owner còn lại VÀ người bị hạ
    transport.sent.length = 0;
    await admin.changeMemberRole({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberIdOf(ws.id, s1),
      role: 'staff',
    });
    const demoted = await mails(2);
    expect(demoted.map((m) => m.to).sort()).toEqual(
      [await emailOf(owner), await emailOf(s1)].sort(),
    );
    expect(demoted.every((m) => !/\/invite\//.test(m.text))).toBe(true);
  });

  it('Owner cuối cùng không bị hạ/khóa/gỡ ở DB; hai Owner cùng hạ nhau song song → chỉ một thành công', async () => {
    const { owner, ws, staff } = await setup(1);
    const [s1] = staff as [string];
    await admin.changeMemberRole({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberIdOf(ws.id, s1),
      role: 'owner',
    });
    const ownerRow = await memberIdOf(ws.id, owner);
    const s1Row = await memberIdOf(ws.id, s1);
    const results = await Promise.allSettled([
      admin.changeMemberRole({
        workspaceId: ws.id,
        actorUserId: owner,
        memberId: s1Row,
        role: 'staff',
      }),
      admin.changeMemberRole({
        workspaceId: ws.id,
        actorUserId: s1,
        memberId: ownerRow,
        role: 'staff',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const owners = await adminQuery(
      "SELECT 1 FROM core.members WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'",
      [ws.id],
    );
    expect(owners).toHaveLength(1);

    // Chạm thẳng DB bằng cf_app (bỏ qua dịch vụ): Owner còn lại tự hạ/khóa/gỡ chính mình đều bị trigger chặn.
    const survivor = await adminQuery<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM core.members WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'",
      [ws.id],
    );
    const { id, user_id: survivorUser } = survivor[0] as { id: string; user_id: string };
    for (const sqlText of [
      "UPDATE core.members SET role = 'staff' WHERE id = $1",
      "UPDATE core.members SET status = 'suspended' WHERE id = $1",
      "UPDATE core.members SET status = 'removed' WHERE id = $1",
    ]) {
      await expect(
        db.withActor(ws.id, survivorUser, async (tx) => {
          const { sql } = await import('@flow/db');
          await tx.execute(sql.raw(sqlText.replace('$1', `'${id}'`)));
        }),
      ).rejects.toThrow();
    }
  });

  it('tạm khóa → mất workspace khỏi danh sách & vai trò; mở khóa → có lại; gỡ giữ dòng và không khôi phục được', async () => {
    const { owner, ws, staff } = await setup(1);
    const [s1] = staff as [string];
    const memberId = await memberIdOf(ws.id, s1);
    const act = (status: 'active' | 'suspended' | 'removed') =>
      admin.setMemberStatus({ workspaceId: ws.id, actorUserId: owner, memberId, status });
    await act('suspended');
    expect(await tenancy.getRole(ws.id, s1)).toBeNull();
    expect((await tenancy.listWorkspacesOfUser(s1)).map((w) => w.id)).not.toContain(ws.id);
    await act('active');
    expect(await tenancy.getRole(ws.id, s1)).toBe('staff');
    await act('removed');
    expect(await tenancy.getRole(ws.id, s1)).toBeNull();
    const rows = await adminQuery<{ status: string }>(
      'SELECT status FROM core.members WHERE id = $1',
      [memberId],
    );
    expect(rows[0]?.status).toBe('removed');
    expect(await codeOf(act('active'))).toBe('NOT_FOUND');
    const actions = (
      await db.withWorkspace(ws.id, (tx) =>
        tx
          .select({ action: actionLogs.action })
          .from(actionLogs)
          .where(eq(actionLogs.workspaceId, ws.id)),
      )
    ).map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(['member.suspended', 'member.restored', 'member.removed']),
    );
  });

  it('không tự tạm khóa/gỡ chính mình', async () => {
    const { owner, ws } = await setup(0);
    const self = await memberIdOf(ws.id, owner);
    for (const status of ['suspended', 'removed'] as const) {
      expect(
        await codeOf(
          admin.setMemberStatus({ workspaceId: ws.id, actorUserId: owner, memberId: self, status }),
        ),
      ).toBe('FORBIDDEN');
    }
  });
});

describe('lời mời: gửi, thu hồi, mời lại', () => {
  it('chỉ Owner mời; token chỉ lưu băm; thư có link; kết quả trung tính', async () => {
    const { owner, ws, staff } = await setup(1);
    const [s1] = staff as [string];
    const email = `${randomUUID()}@example.test`;
    expect(
      await codeOf(
        admin.createInvitation({ workspaceId: ws.id, actorUserId: s1, email, role: 'staff' }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await admin.createInvitation({
        workspaceId: ws.id,
        actorUserId: owner,
        email,
        role: 'staff',
      }),
    ).toEqual({ status: 'sent' });
    const [mail] = await mails(1);
    expect(mail?.to).toBe(email);
    const token = tokenFrom(mail as MailMessage);
    const rows = await adminQuery<{ token_hash: string }>(
      'SELECT token_hash FROM core.invitations WHERE workspace_id = $1',
      [ws.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.token_hash).not.toContain(token);
    expect(JSON.stringify(await logsOf(ws.id, 'invitation.created'))).not.toContain(email);
    expect(await admin.previewInvitation(token)).toEqual({
      workspaceName: 'Shop thử',
      role: 'staff',
    });
  });

  it('mời lại cùng email: token cũ mất hiệu lực, chỉ còn một lời mời đang chờ', async () => {
    const { owner, ws } = await setup(0);
    const email = `${randomUUID()}@example.test`;
    const invite = () =>
      admin.createInvitation({ workspaceId: ws.id, actorUserId: owner, email, role: 'staff' });
    await invite();
    const first = tokenFrom((await mails(1))[0] as MailMessage);
    await invite();
    const second = tokenFrom((await mails(2))[1] as MailMessage);
    expect(second).not.toBe(first);
    expect(await admin.previewInvitation(first)).toBeNull();
    expect(await admin.previewInvitation(second)).not.toBeNull();
    const pending = await admin.listInvitations({ workspaceId: ws.id, actorUserId: owner });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ email, role: 'staff', expired: false });
  });

  it('email đã là thành viên: kết quả y hệt nhưng KHÔNG gửi thư và KHÔNG tạo lời mời', async () => {
    const { owner, ws, staff } = await setup(1);
    const [s1] = staff as [string];
    expect(
      await admin.createInvitation({
        workspaceId: ws.id,
        actorUserId: owner,
        email: (await emailOf(s1)).toUpperCase(),
        role: 'staff',
      }),
    ).toEqual({ status: 'sent' });
    await settle();
    expect(transport.sent).toHaveLength(0);
    expect(await admin.listInvitations({ workspaceId: ws.id, actorUserId: owner })).toHaveLength(0);
  });

  it('thu hồi: token hết hiệu lực; thu hồi lần hai hoặc id lạ → NOT_FOUND; ghi action_logs', async () => {
    const { owner, ws } = await setup(0);
    const email = `${randomUUID()}@example.test`;
    await admin.createInvitation({ workspaceId: ws.id, actorUserId: owner, email, role: 'staff' });
    const token = tokenFrom((await mails(1))[0] as MailMessage);
    const [pending] = await admin.listInvitations({ workspaceId: ws.id, actorUserId: owner });
    const id = pending?.id as string;
    await admin.revokeInvitation({ workspaceId: ws.id, actorUserId: owner, invitationId: id });
    expect(await admin.previewInvitation(token)).toBeNull();
    expect(
      await codeOf(
        admin.revokeInvitation({ workspaceId: ws.id, actorUserId: owner, invitationId: id }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await codeOf(
        admin.revokeInvitation({
          workspaceId: ws.id,
          actorUserId: owner,
          invitationId: randomUUID(),
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(await logsOf(ws.id, 'invitation.revoked')).toHaveLength(1);
  });

  it('gửi lại tạo token mới cho cùng email/vai trò', async () => {
    const { owner, ws } = await setup(0);
    const email = `${randomUUID()}@example.test`;
    await admin.createInvitation({ workspaceId: ws.id, actorUserId: owner, email, role: 'owner' });
    const first = tokenFrom((await mails(1))[0] as MailMessage);
    const [pending] = await admin.listInvitations({ workspaceId: ws.id, actorUserId: owner });
    expect(
      await admin.resendInvitation({
        workspaceId: ws.id,
        actorUserId: owner,
        invitationId: pending?.id as string,
      }),
    ).toEqual({ status: 'sent' });
    const second = tokenFrom((await mails(2))[1] as MailMessage);
    expect(await admin.previewInvitation(first)).toBeNull();
    expect(await admin.previewInvitation(second)).toEqual({
      workspaceName: 'Shop thử',
      role: 'owner',
    });
  });

  it('hạn mức: 3 lời mời/ngày/email và 20/giờ/workspace', async () => {
    const { owner, ws } = await setup(0);
    const same = `${randomUUID()}@example.test`;
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await admin.createInvitation({
          workspaceId: ws.id,
          actorUserId: owner,
          email: same,
          role: 'staff',
        }),
      );
    }
    expect(results.slice(0, 3).every((r) => r.status === 'sent')).toBe(true);
    expect(results[3]).toMatchObject({ status: 'rate_limited' });

    const second = await setup(0);
    let limited = 0;
    for (let i = 0; i < 22; i++) {
      const r = await admin.createInvitation({
        workspaceId: second.ws.id,
        actorUserId: second.owner,
        email: `${randomUUID()}@example.test`,
        role: 'staff',
      });
      if (r.status === 'rate_limited') limited++;
    }
    expect(limited).toBe(2);
  });
});

describe('lời mời: nhận', () => {
  async function invited(role: 'owner' | 'staff' = 'staff') {
    const base = await setup(0);
    const email = `${randomUUID()}@example.test`;
    await admin.createInvitation({
      workspaceId: base.ws.id,
      actorUserId: base.owner,
      email,
      role,
    });
    const token = tokenFrom((await mails(1))[0] as MailMessage);
    transport.sent.length = 0;
    return { ...base, email, token };
  }

  it('đúng token + đúng email đã xác minh → thành viên active; dùng lại lần hai thất bại; ghi action_logs', async () => {
    const { ws, email, token } = await invited('staff');
    const user = await createTestUser('Người mới', { email, verified: true });
    expect(await admin.acceptInvitation({ userId: user, token })).toEqual({
      status: 'accepted',
      workspaceId: ws.id,
    });
    expect(await tenancy.getRole(ws.id, user)).toBe('staff');
    expect(await admin.acceptInvitation({ userId: user, token })).toEqual({ status: 'invalid' });
    const logs = await logsOf(ws.id, 'invitation.accepted');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: user, after: { role: 'staff', status: 'active' } });
    expect(await admin.previewInvitation(token)).toBeNull();
  });

  it('email không khớp / chưa xác minh / token sai / hết hạn / đã thu hồi → CÙNG MỘT kết quả invalid', async () => {
    const { owner, ws, email, token } = await invited();
    const wrongEmail = await createTestUser('Sai email', {
      email: `${randomUUID()}@example.test`,
      verified: true,
    });
    const unverified = await createTestUser('Chưa xác minh', { email, verified: false });
    const outcomes = [
      await admin.acceptInvitation({ userId: wrongEmail, token }),
      await admin.acceptInvitation({ userId: unverified, token }),
      await admin.acceptInvitation({
        userId: wrongEmail,
        token: randomBytes(32).toString('base64url'),
      }),
      await admin.acceptInvitation({ userId: wrongEmail, token: 'khong-hop-le' }),
    ];
    // hết hạn
    await adminQuery(
      "UPDATE core.invitations SET expires_at = now() - interval '1 minute' WHERE workspace_id = $1",
      [ws.id],
    );
    // người dùng ĐÚNG email vừa được xác minh: lời mời đã hết hạn vẫn bị từ chối
    await adminQuery('UPDATE core.users SET email_verified = true WHERE id = $1', [unverified]);
    const rightUser = unverified;
    outcomes.push(await admin.acceptInvitation({ userId: rightUser, token }));
    // đã thu hồi
    const second = await invited();
    const [pending] = await admin.listInvitations({
      workspaceId: second.ws.id,
      actorUserId: second.owner,
    });
    await admin.revokeInvitation({
      workspaceId: second.ws.id,
      actorUserId: second.owner,
      invitationId: pending?.id as string,
    });
    const matching = await createTestUser('Khớp', { email: second.email, verified: true });
    outcomes.push(await admin.acceptInvitation({ userId: matching, token: second.token }));
    expect(new Set(outcomes.map((o) => JSON.stringify(o)))).toEqual(
      new Set([JSON.stringify({ status: 'invalid' })]),
    );
    expect(await tenancy.getRole(ws.id, wrongEmail)).toBeNull();
    expect(owner).toBeTruthy();
  });

  it('email khớp không phân biệt hoa/thường; lời mời Owner → báo mọi Owner', async () => {
    const { owner, ws, email, token } = await invited('owner');
    const user = await createTestUser('Owner mới', { email: email.toUpperCase(), verified: true });
    expect((await admin.acceptInvitation({ userId: user, token })).status).toBe('accepted');
    expect(await tenancy.getRole(ws.id, user)).toBe('owner');
    const sent = await mails(2);
    expect(sent.map((m) => m.to).sort()).toEqual(
      [await emailOf(owner), await emailOf(user)].sort(),
    );
  });

  it('thành viên đang bị tạm khóa không tự mở khóa bằng lời mời; người đã gỡ được kích hoạt lại với vai trò mới', async () => {
    const { owner, ws, staff } = await setup(2);
    const [s1, s2] = staff as [string, string];
    const memberOf = (u: string) => memberIdOf(ws.id, u);
    await admin.setMemberStatus({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberOf(s1),
      status: 'suspended',
    });
    await admin.setMemberStatus({
      workspaceId: ws.id,
      actorUserId: owner,
      memberId: await memberOf(s2),
      status: 'removed',
    });
    for (const u of [s1, s2]) {
      await admin.createInvitation({
        workspaceId: ws.id,
        actorUserId: owner,
        email: await emailOf(u),
        role: 'owner',
      });
    }
    const tokens = (await mails(2)).map(tokenFrom);
    const byEmail = new Map((await mails(2)).map((m) => [m.to, tokenFrom(m)] as const));
    expect(tokens).toHaveLength(2);
    expect(
      await admin.acceptInvitation({ userId: s1, token: byEmail.get(await emailOf(s1)) as string }),
    ).toEqual({
      status: 'invalid',
    });
    expect(await tenancy.getRole(ws.id, s1)).toBeNull();
    expect(
      (
        await admin.acceptInvitation({
          userId: s2,
          token: byEmail.get(await emailOf(s2)) as string,
        })
      ).status,
    ).toBe('accepted');
    expect(await tenancy.getRole(ws.id, s2)).toBe('owner');
  });

  it('hạn mức nhận lời mời: quá 10 lần thử sai trong 15 phút → rate_limited', async () => {
    const { ws } = await invited();
    const user = await person('Dò token');
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(
        await admin.acceptInvitation({
          userId: user,
          token: randomBytes(32).toString('base64url'),
        }),
      );
    }
    expect(results.slice(0, 10).every((r) => r.status === 'invalid')).toBe(true);
    expect(results[10]?.status).toBe('rate_limited');
    expect(await tenancy.getRole(ws.id, user)).toBeNull();
  });
});

describe('cô lập chéo workspace: user của A dùng id của B → không thấy / NOT_FOUND', () => {
  it('mọi hành động với id (member, lời mời) của workspace khác bị từ chối', async () => {
    const a = await setup(1);
    const b = await setup(1);
    // lời mời ở B
    const email = `${randomUUID()}@example.test`;
    const adminB = admin;
    await adminB.createInvitation({
      workspaceId: b.ws.id,
      actorUserId: b.owner,
      email,
      role: 'staff',
    });
    const [inviteB] = await adminB.listInvitations({ workspaceId: b.ws.id, actorUserId: b.owner });
    const memberB = await memberIdOf(b.ws.id, b.staff[0] as string);

    // Owner của A gọi trong ngữ cảnh workspace A với id của B
    expect(
      await codeOf(
        admin.changeMemberRole({
          workspaceId: a.ws.id,
          actorUserId: a.owner,
          memberId: memberB,
          role: 'owner',
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await codeOf(
        admin.setMemberStatus({
          workspaceId: a.ws.id,
          actorUserId: a.owner,
          memberId: memberB,
          status: 'removed',
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await codeOf(
        admin.revokeInvitation({
          workspaceId: a.ws.id,
          actorUserId: a.owner,
          invitationId: inviteB?.id as string,
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await codeOf(
        admin.resendInvitation({
          workspaceId: a.ws.id,
          actorUserId: a.owner,
          invitationId: inviteB?.id as string,
        }),
      ),
    ).toBe('NOT_FOUND');
    // Owner của A cố đóng vai Owner trong workspace B → không phải thành viên
    for (const call of [
      () => admin.listMembers({ workspaceId: b.ws.id, actorUserId: a.owner }),
      () => admin.listInvitations({ workspaceId: b.ws.id, actorUserId: a.owner }),
      () =>
        admin.createInvitation({
          workspaceId: b.ws.id,
          actorUserId: a.owner,
          email,
          role: 'staff',
        }),
      () =>
        admin.changeMemberRole({
          workspaceId: b.ws.id,
          actorUserId: a.owner,
          memberId: memberB,
          role: 'owner',
        }),
    ]) {
      expect(await codeOf(call())).toBe('FORBIDDEN');
    }
    expect(await tenancy.getRole(b.ws.id, b.staff[0] as string)).toBe('staff');
    expect(
      await admin.listInvitations({ workspaceId: b.ws.id, actorUserId: b.owner }),
    ).toHaveLength(1);
  });
});

describe('sau kiểm chứng độc lập: hạn mức mời và nhận lời mời của Owner', () => {
  it('hạn mức theo người mời: tạo thêm workspace không nhân hạn mức 20 thư/giờ', async () => {
    const a = await setup(0);
    const second = await tenancy.createWorkspace({ userId: a.owner, name: 'Workspace thứ hai' });
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const workspaceId = i % 2 === 0 ? a.ws.id : second.id;
      const r = await admin.createInvitation({
        workspaceId,
        actorUserId: a.owner,
        email: `${randomUUID()}@example.test`,
        role: 'staff',
      });
      if (r.status === 'rate_limited') limited++;
    }
    expect(limited).toBe(5); // 20 thư cho cả người mời, dù chia hai workspace
  });

  it('workspace khác không chặn được việc mời cùng một email của workspace thật', async () => {
    const victim = `${randomUUID()}@example.test`;
    const attacker = await setup(0);
    for (let i = 0; i < 3; i++) {
      await admin.createInvitation({
        workspaceId: attacker.ws.id,
        actorUserId: attacker.owner,
        email: victim,
        role: 'staff',
      });
    }
    expect(
      await admin.createInvitation({
        workspaceId: attacker.ws.id,
        actorUserId: attacker.owner,
        email: victim,
        role: 'staff',
      }),
    ).toMatchObject({ status: 'rate_limited' });
    // cùng bộ giới hạn (không gọi setup() vì nó tạo bộ mới): workspace thật + Owner khác vẫn mời được
    const realOwner = await person('Chủ shop thật');
    const real = await tenancy.createWorkspace({ userId: realOwner, name: 'Shop thật' });
    expect(
      await admin.createInvitation({
        workspaceId: real.id,
        actorUserId: realOwner,
        email: victim,
        role: 'staff',
      }),
    ).toEqual({ status: 'sent' });
  });
});

describe('DB ép chỉ-Owner độc lập với mã kiểm quyền (feat/rls-actor-ctx)', () => {
  it('bỏ qua createWorkspaceAdmin: Staff gọi thẳng withActor hoặc withWorkspace vẫn không ghi được members/invitations', async () => {
    const { ws, staff, owner } = await setup(1);
    const [s1] = staff as [string];
    const target = await memberIdOf(ws.id, owner);
    const { sql } = await import('@flow/db');
    const denied = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string }).cause?.code;
        return code === '42501';
      }
      return false;
    };
    // UPDATE bị USING ẩn dòng → 0 dòng; INSERT bị chặn bằng lỗi RLS
    const updated = await db.withActor(ws.id, s1, (tx) =>
      tx.execute(sql`UPDATE core.members SET role = 'staff' WHERE id = ${target} RETURNING id`),
    );
    expect(updated.rows).toHaveLength(0);
    expect(
      await denied(() =>
        db.withActor(ws.id, s1, (tx) =>
          tx.execute(
            sql`INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at)
                VALUES (${ws.id}, 'x@example.test', 'owner', ${`h-${randomUUID()}`}, now() + interval '1 day')`,
          ),
        ),
      ),
    ).toBe(true);
    expect(
      await denied(() =>
        db.withWorkspace(ws.id, (tx) =>
          tx.execute(
            sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${ws.id}, ${s1}, 'owner')`,
          ),
        ),
      ),
    ).toBe(true);
    expect(await tenancy.getRole(ws.id, owner)).toBe('owner');
    expect(await tenancy.getRole(ws.id, s1)).toBe('staff');
  });
});
