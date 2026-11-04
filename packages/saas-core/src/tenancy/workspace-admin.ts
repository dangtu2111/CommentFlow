import { createHash, randomBytes } from 'node:crypto';
import type { Database, FlowDb } from '@flow/db/runtime';
import { and, asc, eq, inArray, isNull, sql } from '@flow/db/runtime';
import { invitations, members, users, workspaces } from '@flow/db/schema/core';
import { AppError, isLocale, type Locale } from '@flow/shared';
import { z } from 'zod';
import type { Notifier } from '../notify/notifier';
import type { OwnerChange } from '../notify/templates';
import type { RateLimiter } from '../ratelimit/limiter';
import { writeActionLog } from './action-log';
import { isLastOwnerViolation, isRlsViolation, isUniqueViolation } from './pg-errors';
import type { MemberRole } from './tenancy';

export const INVITATION_TTL_DAYS = 7;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const uuidSchema = z.uuid();
const roleSchema = z.enum(['owner', 'staff']);
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_FAILED', message);
  return result.data;
}

export type MemberStatus = 'active' | 'suspended' | 'removed';

/** Một dòng của trang Thành viên (Owner xem): chỉ trường cần hiển thị. */
export type MemberRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: MemberRole;
  status: 'active' | 'suspended';
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
};

export type InviteResult =
  | { status: 'sent' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

export type AcceptResult =
  | { status: 'accepted'; workspaceId: string }
  /** Mọi lý do không hợp lệ (sai, hết hạn, đã dùng, đã thu hồi, email không khớp, bị khóa...) gộp một kết quả. */
  | { status: 'invalid' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

export type InvitationPreview = { workspaceName: string; role: MemberRole };

type Person = { userId: string; name: string; email: string; locale: Locale };

export const hashInvitationToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Quản lý thành viên + lời mời của workspace (FR-002…005). Mọi truy vấn qua withActor/withWorkspace/withUser. Việc "chỉ
 * Owner" được kiểm ở ĐÂY và ép thêm ở DB (RLS withActor, 0016); Owner cuối cùng được bảo vệ bằng trigger (0015).
 * userId luôn lấy từ phiên phía server; id trong form (memberId, invitationId) chỉ tra trong workspace hiện tại —
 * không thấy → NOT_FOUND.
 */
export function createWorkspaceAdmin(options: {
  db: FlowDb;
  notifier: Notifier;
  limiter: RateLimiter;
  /** URL gốc của web (BETTER_AUTH_URL), dùng dựng link trong thư. */
  appUrl: string;
  now?: () => Date;
}) {
  const { db, notifier, limiter } = options;
  const now = options.now ?? (() => new Date());
  const appUrl = options.appUrl.replace(/\/+$/, '');

  /**
   * Mọi thao tác chỉ-Owner chạy bằng withActor: DB biết người gọi (`app.user_id`) nên policy RLS chỉ cho Owner
   * `active` của workspace (migration 0016). Lỗi RLS (42501) → FORBIDDEN, giống kiểm quyền ở code.
   */
  async function asActor<T>(
    workspaceId: string,
    actorUserId: string,
    fn: (tx: Database) => Promise<T>,
  ): Promise<T> {
    try {
      return await db.withActor(workspaceId, actorUserId, fn);
    } catch (error) {
      if (isRlsViolation(error)) {
        throw new AppError(
          'FORBIDDEN',
          'Chỉ Owner của workspace mới thực hiện được thao tác này.',
          {
            cause: error,
          },
        );
      }
      throw error;
    }
  }

  async function assertOwner(tx: Database, workspaceId: string, userId: string): Promise<void> {
    const rows = await tx
      .select({ role: members.role })
      .from(members)
      .where(
        and(
          eq(members.workspaceId, workspaceId),
          eq(members.userId, userId),
          eq(members.status, 'active'),
        ),
      );
    if (rows[0]?.role !== 'owner') {
      throw new AppError('FORBIDDEN', 'Chỉ Owner của workspace mới thực hiện được thao tác này.');
    }
  }

  const localeOf = (value: string | null, fallback: Locale): Locale =>
    isLocale(value) ? value : fallback;

  async function workspaceInfo(tx: Database, workspaceId: string) {
    const rows = await tx
      .select({ name: workspaces.name, defaultLang: workspaces.defaultLang })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    const row = rows[0];
    return {
      name: row?.name ?? '',
      lang: localeOf(row?.defaultLang ?? null, 'vi'),
    };
  }

  /** Người dùng đang `active` trong workspace (users chỉ thấy thành viên active — migration 0010/0012). */
  async function activePeople(
    tx: Database,
    workspaceId: string,
    fallback: Locale,
    filter: { role?: MemberRole; userId?: string } = {},
  ): Promise<Person[]> {
    const conditions = [eq(members.workspaceId, workspaceId), eq(members.status, 'active')];
    if (filter.role) conditions.push(eq(members.role, filter.role));
    if (filter.userId) conditions.push(eq(members.userId, filter.userId));
    const rows = await tx
      .select({ userId: users.id, name: users.name, email: users.email, locale: users.locale })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(...conditions))
      .orderBy(asc(users.email));
    return rows.map((r) => ({ ...r, locale: localeOf(r.locale, fallback) }));
  }

  /** Báo MỌI Owner (đang hoạt động sau thay đổi, cộng người vừa mất vai trò Owner) — gửi nền, không chặn thao tác. */
  function notifyOwners(input: {
    workspaceName: string;
    change: OwnerChange;
    owners: Person[];
    extra?: Person;
    targetName: string;
    actorName: string;
  }): void {
    const seen = new Set<string>();
    const recipients = [...input.owners, ...(input.extra ? [input.extra] : [])].filter((p) => {
      if (seen.has(p.userId)) return false;
      seen.add(p.userId);
      return true;
    });
    for (const person of recipients) {
      notifier.sendInBackground(
        { email: person.email, name: person.name, locale: person.locale },
        {
          kind: 'owner-change',
          url: `${appUrl}/app/members`,
          workspaceName: input.workspaceName,
          change: input.change,
          targetName: input.targetName,
          actorName: input.actorName,
        },
      );
    }
  }

  async function runMemberChange<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (isLastOwnerViolation(error)) {
        throw new AppError(
          'CONFLICT',
          'Workspace phải luôn còn ít nhất một Owner đang hoạt động.',
          {
            cause: error,
          },
        );
      }
      throw error;
    }
  }

  type OwnerEvent = {
    change: OwnerChange;
    workspaceName: string;
    owners: Person[];
    extra?: Person;
    targetName: string;
    actorName: string;
  };

  /** Đọc thành viên đích TRONG workspace hiện tại; không thấy (hoặc đã gỡ) → NOT_FOUND. */
  async function findMember(tx: Database, workspaceId: string, memberId: string) {
    const rows = await tx
      .select({
        id: members.id,
        userId: members.userId,
        role: members.role,
        status: members.status,
      })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.workspaceId, workspaceId)));
    const row = rows[0];
    if (!row || row.status === 'removed') {
      throw new AppError('NOT_FOUND', 'Không tìm thấy thành viên.');
    }
    return { ...row, role: row.role as MemberRole, status: row.status as 'active' | 'suspended' };
  }

  const api = {
    /** Danh sách cho trang Thành viên: đang hoạt động + tạm khóa (không có đã gỡ). Chỉ Owner. */
    async listMembers(input: { workspaceId: string; actorUserId: string }): Promise<MemberRow[]> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      return asActor(workspaceId, actor, async (tx) => {
        await assertOwner(tx, workspaceId, actor);
        const rows = await tx
          .select({
            memberId: members.id,
            userId: members.userId,
            role: members.role,
            status: members.status,
            name: users.name,
            email: users.email,
            image: users.image,
          })
          .from(members)
          .leftJoin(users, eq(users.id, members.userId))
          .where(
            and(
              eq(members.workspaceId, workspaceId),
              inArray(members.status, ['active', 'suspended']),
            ),
          )
          .orderBy(asc(members.createdAt));
        return rows.map((r) => ({
          memberId: r.memberId,
          userId: r.userId,
          // users của thành viên đang bị tạm khóa không đọc được (RLS chỉ cho thấy thành viên active)
          name: r.name ?? '',
          email: r.email ?? '',
          image: r.image,
          role: r.role as MemberRole,
          status: r.status as 'active' | 'suspended',
        }));
      });
    },

    /** Đổi vai trò. Không tự đổi của mình; Owner cuối cùng không bị hạ (DB chặn, kể cả chạy song song). */
    async changeMemberRole(input: {
      workspaceId: string;
      actorUserId: string;
      memberId: string;
      role: MemberRole;
    }): Promise<void> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      const memberId = parse(uuidSchema, input.memberId, 'memberId không hợp lệ.');
      const role = parse(roleSchema, input.role, 'Vai trò phải là owner hoặc staff.');

      const event = await runMemberChange(() =>
        asActor(workspaceId, actor, async (tx): Promise<OwnerEvent | null> => {
          await assertOwner(tx, workspaceId, actor);
          const target = await findMember(tx, workspaceId, memberId);
          if (target.userId === actor) {
            throw new AppError('FORBIDDEN', 'Bạn không thể tự đổi vai trò của chính mình.');
          }
          if (target.role === role) return null;
          const ws = await workspaceInfo(tx, workspaceId);
          const [targetPerson] = await activePeople(tx, workspaceId, ws.lang, {
            userId: target.userId,
          });
          // RLS ẩn dòng nếu người gọi KHÔNG còn là Owner khi câu lệnh bắt đầu → 0 dòng: coi như bị từ chối, không ghi nhật ký.
          // (Owner bị hạ quyền song song mà chưa commit vẫn hoàn tất lệnh đang chạy — snapshot READ COMMITTED; chấp nhận được.)
          const updated = await tx
            .update(members)
            .set({ role, updatedAt: now() })
            .where(and(eq(members.id, target.id), eq(members.workspaceId, workspaceId)))
            .returning({ id: members.id });
          if (updated.length === 0)
            throw new AppError(
              'FORBIDDEN',
              'Chỉ Owner của workspace mới thực hiện được thao tác này.',
            );
          await writeActionLog(tx, {
            workspaceId,
            actorId: actor,
            action: 'member.role_changed',
            targetType: 'member',
            targetId: target.id,
            before: { role: target.role },
            after: { role },
          });
          const [actorPerson] = await activePeople(tx, workspaceId, ws.lang, { userId: actor });
          return {
            change: role === 'owner' ? 'added' : 'role_changed',
            workspaceName: ws.name,
            owners: await activePeople(tx, workspaceId, ws.lang, { role: 'owner' }),
            ...(target.role === 'owner' && targetPerson ? { extra: targetPerson } : {}),
            targetName: targetPerson?.name ?? '',
            actorName: actorPerson?.name ?? '',
          };
        }),
      );
      if (event) notifyOwners(event);
    },

    /**
     * Tạm khóa / mở khóa / gỡ. Chuyển trạng thái hợp lệ: active→suspended, suspended→active, active|suspended→removed
     * (removed giữ dòng, không thể khôi phục — phải mời lại). Không tự tác động lên chính mình.
     */
    async setMemberStatus(input: {
      workspaceId: string;
      actorUserId: string;
      memberId: string;
      status: MemberStatus;
    }): Promise<void> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      const memberId = parse(uuidSchema, input.memberId, 'memberId không hợp lệ.');
      const status = parse(
        z.enum(['active', 'suspended', 'removed']),
        input.status,
        'Trạng thái không hợp lệ.',
      );

      const event = await runMemberChange(() =>
        asActor(workspaceId, actor, async (tx): Promise<OwnerEvent | null> => {
          await assertOwner(tx, workspaceId, actor);
          const target = await findMember(tx, workspaceId, memberId);
          if (target.userId === actor) {
            throw new AppError('FORBIDDEN', 'Bạn không thể tự tạm khóa hoặc tự gỡ chính mình.');
          }
          if (target.status === status) return null;
          const ws = await workspaceInfo(tx, workspaceId);
          const [targetBefore] = await activePeople(tx, workspaceId, ws.lang, {
            userId: target.userId,
          });
          const updated = await tx
            .update(members)
            .set({ status, updatedAt: now() })
            .where(and(eq(members.id, target.id), eq(members.workspaceId, workspaceId)))
            .returning({ id: members.id });
          if (updated.length === 0)
            throw new AppError(
              'FORBIDDEN',
              'Chỉ Owner của workspace mới thực hiện được thao tác này.',
            );
          await writeActionLog(tx, {
            workspaceId,
            actorId: actor,
            action: `member.${status === 'removed' ? 'removed' : status === 'suspended' ? 'suspended' : 'restored'}`,
            targetType: 'member',
            targetId: target.id,
            before: { status: target.status, role: target.role },
            after: { status, role: target.role },
          });
          if (target.role !== 'owner') return null;
          const [targetAfter] = await activePeople(tx, workspaceId, ws.lang, {
            userId: target.userId,
          });
          const targetPerson = targetAfter ?? targetBefore;
          const [actorPerson] = await activePeople(tx, workspaceId, ws.lang, { userId: actor });
          return {
            change:
              status === 'removed' ? 'removed' : status === 'suspended' ? 'suspended' : 'restored',
            workspaceName: ws.name,
            owners: await activePeople(tx, workspaceId, ws.lang, { role: 'owner' }),
            ...(targetBefore ? { extra: targetBefore } : {}),
            targetName: targetPerson?.name ?? '',
            actorName: actorPerson?.name ?? '',
          };
        }),
      );
      if (event) notifyOwners(event);
    },

    /** Lời mời đang chờ (chưa dùng, chưa thu hồi), kể cả đã hết hạn để Owner gửi lại/thu hồi. Chỉ Owner. */
    async listInvitations(input: {
      workspaceId: string;
      actorUserId: string;
    }): Promise<PendingInvitation[]> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      return asActor(workspaceId, actor, async (tx) => {
        await assertOwner(tx, workspaceId, actor);
        const rows = await tx
          .select({
            id: invitations.id,
            email: invitations.email,
            role: invitations.role,
            expiresAt: invitations.expiresAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .where(
            and(
              eq(invitations.workspaceId, workspaceId),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .orderBy(asc(invitations.createdAt));
        const current = now().getTime();
        return rows.map((r) => ({
          ...r,
          role: r.role as MemberRole,
          expired: r.expiresAt.getTime() <= current,
        }));
      });
    },

    /**
     * Mời theo email + vai trò. Kết quả LUÔN trung tính: email đã là thành viên, đã có tài khoản hay chưa đều trả
     * `sent` (không lộ). Mời lại cùng email thu hồi lời mời đang chờ trước đó (token cũ mất hiệu lực).
     */
    async createInvitation(input: {
      workspaceId: string;
      actorUserId: string;
      email: string;
      role: MemberRole;
    }): Promise<InviteResult> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      const email = parse(emailSchema, input.email, 'Email không hợp lệ.');
      const role = parse(roleSchema, input.role, 'Vai trò phải là owner hoặc staff.');

      // Kiểm quyền TRƯỚC khi đếm hạn mức (người không phải Owner không được tiêu hạn mức của workspace).
      await asActor(workspaceId, actor, (tx) => assertOwner(tx, workspaceId, actor));
      const decision = await limiter.check('invite', { workspaceId, email, userId: actor });
      if (!decision.allowed) {
        return { status: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds };
      }

      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashInvitationToken(token);
      const expiresAt = new Date(now().getTime() + INVITATION_TTL_DAYS * 24 * 3600 * 1000);

      let mail: { workspaceName: string; lang: Locale; inviterName: string } | null;
      try {
        mail = await asActor(workspaceId, actor, async (tx) => {
          await assertOwner(tx, workspaceId, actor);
          const ws = await workspaceInfo(tx, workspaceId);
          const existing = await tx
            .select({ id: members.id })
            .from(members)
            .innerJoin(users, eq(users.id, members.userId))
            .where(
              and(
                eq(members.workspaceId, workspaceId),
                eq(members.status, 'active'),
                eq(users.email, email),
              ),
            );
          if (existing.length > 0) return null; // đã là thành viên: trung tính, không gửi thư

          await tx
            .update(invitations)
            .set({ revokedAt: now() })
            .where(
              and(
                eq(invitations.workspaceId, workspaceId),
                eq(invitations.email, email),
                isNull(invitations.acceptedAt),
                isNull(invitations.revokedAt),
              ),
            );
          const inserted = await tx
            .insert(invitations)
            .values({ workspaceId, email, role, tokenHash, expiresAt, invitedBy: actor })
            .returning({ id: invitations.id });
          await writeActionLog(tx, {
            workspaceId,
            actorId: actor,
            action: 'invitation.created',
            targetType: 'invitation',
            targetId: inserted[0]?.id ?? '',
            after: { role },
          });
          const [inviter] = await activePeople(tx, workspaceId, ws.lang, { userId: actor });
          return { workspaceName: ws.name, lang: ws.lang, inviterName: inviter?.name ?? '' };
        });
      } catch (error) {
        // Hai lời mời cùng email chạy song song: một cái thắng, cái kia coi như đã gửi.
        if (isUniqueViolation(error)) return { status: 'sent' };
        throw error;
      }

      if (mail) {
        notifier.sendInBackground(
          { email, name: email.split('@')[0] ?? email, locale: mail.lang },
          {
            kind: 'workspace-invite',
            url: `${appUrl}/invite/${token}`,
            workspaceName: mail.workspaceName,
            role,
            inviterName: mail.inviterName,
            days: INVITATION_TTL_DAYS,
          },
        );
      }
      return { status: 'sent' };
    },

    /** Thu hồi lời mời đang chờ; id không thuộc workspace hiện tại hoặc không còn chờ → NOT_FOUND. */
    async revokeInvitation(input: {
      workspaceId: string;
      actorUserId: string;
      invitationId: string;
    }): Promise<void> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      const invitationId = parse(uuidSchema, input.invitationId, 'invitationId không hợp lệ.');
      await asActor(workspaceId, actor, async (tx) => {
        await assertOwner(tx, workspaceId, actor);
        const revoked = await tx
          .update(invitations)
          .set({ revokedAt: now() })
          .where(
            and(
              eq(invitations.id, invitationId),
              eq(invitations.workspaceId, workspaceId),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .returning({ id: invitations.id });
        if (revoked.length === 0) throw new AppError('NOT_FOUND', 'Không tìm thấy lời mời.');
        await writeActionLog(tx, {
          workspaceId,
          actorId: actor,
          action: 'invitation.revoked',
          targetType: 'invitation',
          targetId: invitationId,
        });
      });
    },

    /** Gửi lại = mời lại cùng email + vai trò (token cũ mất hiệu lực, hạn mức áp dụng như mời mới). */
    async resendInvitation(input: {
      workspaceId: string;
      actorUserId: string;
      invitationId: string;
    }): Promise<InviteResult> {
      const workspaceId = parse(uuidSchema, input.workspaceId, 'workspaceId không hợp lệ.');
      const actor = parse(uuidSchema, input.actorUserId, 'actorUserId không hợp lệ.');
      const invitationId = parse(uuidSchema, input.invitationId, 'invitationId không hợp lệ.');
      const found = await asActor(workspaceId, actor, async (tx) => {
        await assertOwner(tx, workspaceId, actor);
        const rows = await tx
          .select({ email: invitations.email, role: invitations.role })
          .from(invitations)
          .where(
            and(
              eq(invitations.id, invitationId),
              eq(invitations.workspaceId, workspaceId),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
            ),
          );
        return rows[0];
      });
      if (!found) throw new AppError('NOT_FOUND', 'Không tìm thấy lời mời.');
      return api.createInvitation({
        workspaceId,
        actorUserId: actor,
        email: found.email,
        role: found.role as MemberRole,
      });
    },

    /** Xem trước lời mời bằng token (trang /invite/<token> trước khi đăng nhập): chỉ tên workspace + vai trò. */
    async previewInvitation(token: string): Promise<InvitationPreview | null> {
      if (!TOKEN_PATTERN.test(token)) return null;
      const result = await db.withSystem((tx) =>
        tx.execute<{ workspace_name: string; role: string }>(
          sql`SELECT workspace_name, role FROM core.invitation_preview(${hashInvitationToken(token)})`,
        ),
      );
      const row = result.rows[0];
      return row ? { workspaceName: row.workspace_name, role: row.role as MemberRole } : null;
    },

    /**
     * Nhận lời mời bằng token. userId từ phiên server; email được so khớp TRONG DB (hàm 0015 không nhận email).
     * Mọi ca không hợp lệ trả `invalid` giống hệt nhau.
     */
    async acceptInvitation(input: { userId: string; token: string }): Promise<AcceptResult> {
      const userId = parse(uuidSchema, input.userId, 'userId không hợp lệ.');
      const decision = await limiter.check('inviteAccept', { userId });
      if (!decision.allowed) {
        return { status: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds };
      }
      if (!TOKEN_PATTERN.test(input.token)) return { status: 'invalid' };

      const result = await db.withUser(userId, (tx) =>
        tx.execute<{
          accepted_workspace_id: string;
          accepted_role: string;
          previous_role: string | null;
          inviter_id: string | null;
        }>(sql`SELECT * FROM core.accept_invitation(${hashInvitationToken(input.token)})`),
      );
      const row = result.rows[0];
      if (!row) return { status: 'invalid' };
      await limiter.reset('inviteAccept', { userId });

      // Chỉ báo Owner khi thật sự thêm một Owner mới (lời mời không bao giờ hạ vai trò thành viên đang hoạt động).
      if (row.accepted_role === 'owner' && row.previous_role !== 'owner') {
        await api.notifyAcceptedOwnerChange({
          workspaceId: row.accepted_workspace_id,
          userId,
          invitedBy: row.inviter_id,
          newRole: row.accepted_role as MemberRole,
          previousRole: row.previous_role as MemberRole | null,
        });
      }
      return { status: 'accepted', workspaceId: row.accepted_workspace_id };
    },

    /** (Nội bộ) Báo Owner khi một lời mời làm thay đổi Owner; lỗi gửi thư không làm hỏng việc nhận lời mời. */
    async notifyAcceptedOwnerChange(input: {
      workspaceId: string;
      userId: string;
      invitedBy: string | null;
      newRole: MemberRole;
      previousRole: MemberRole | null;
    }): Promise<void> {
      try {
        const event = await db.withWorkspace(input.workspaceId, async (tx) => {
          const ws = await workspaceInfo(tx, input.workspaceId);
          const [target] = await activePeople(tx, input.workspaceId, ws.lang, {
            userId: input.userId,
          });
          const inviter = input.invitedBy
            ? (await activePeople(tx, input.workspaceId, ws.lang, { userId: input.invitedBy }))[0]
            : undefined;
          return {
            workspaceName: ws.name,
            owners: await activePeople(tx, input.workspaceId, ws.lang, { role: 'owner' }),
            targetName: target?.name ?? '',
            actorName: inviter?.name ?? target?.name ?? '',
          };
        });
        notifyOwners({
          ...event,
          change: input.newRole === 'owner' ? 'added' : 'role_changed',
        });
      } catch {
        // Báo Owner là việc phụ: không ném lỗi ra ngoài (nhật ký invitation.accepted đã ghi trong DB).
      }
    },
  };
  return api;
}

export type WorkspaceAdmin = ReturnType<typeof createWorkspaceAdmin>;
