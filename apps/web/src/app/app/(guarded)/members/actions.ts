'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import {
  changeForIntent,
  type MembersFormState,
  parseInviteForm,
  retryMinutes,
} from '../../../../lib/members-form';
import { getAuthRuntime } from '../../../../server/auth';
import { membersErrorToState } from '../../../../server/members-errors';
import { requireAppUser } from '../../../../server/require-app-user';

/**
 * Server Action của trang Thành viên. Chỉ Owner (requireAppUser role: 'owner' → người khác nhận 404). userId và
 * workspaceId lấy từ phiên/cookie đã kiểm phía server; id trong form (memberId, invitationId) chỉ được tra TRONG
 * workspace hiện tại — id của workspace khác → 404.
 */
const OWNER_ONLY = { role: 'owner' } as const;
const field = (data: FormData, key: string): unknown => data.get(key);

/** Đổi vai trò / tạm khóa / mở khóa / gỡ một thành viên. */
export async function memberAction(
  _previous: MembersFormState,
  data: FormData,
): Promise<MembersFormState> {
  const { user, workspace } = await requireAppUser(OWNER_ONLY);
  const change = changeForIntent(field(data, 'intent'));
  const memberId = field(data, 'memberId');
  if (!change || typeof memberId !== 'string') notFound();
  try {
    const admin = getAuthRuntime().workspaceAdmin;
    const base = { workspaceId: workspace.id, actorUserId: user.id, memberId };
    if (change.kind === 'role') await admin.changeMemberRole({ ...base, role: change.role });
    else await admin.setMemberStatus({ ...base, status: change.status });
  } catch (error) {
    return membersErrorToState(error);
  }
  revalidatePath('/app/members');
  return { status: 'ok' };
}

/** Mời theo email + vai trò. Kết quả trung tính: không cho biết email đã có tài khoản/đã là thành viên hay chưa. */
export async function inviteAction(
  _previous: MembersFormState,
  data: FormData,
): Promise<MembersFormState> {
  const { user, workspace } = await requireAppUser(OWNER_ONLY);
  const parsed = parseInviteForm({ email: field(data, 'email'), role: field(data, 'role') });
  if (!parsed.ok) return { status: 'error', message: parsed.message, email: parsed.email };
  try {
    const result = await getAuthRuntime().workspaceAdmin.createInvitation({
      workspaceId: workspace.id,
      actorUserId: user.id,
      email: parsed.email,
      role: parsed.role,
    });
    if (result.status === 'rate_limited') {
      return {
        status: 'error',
        message: 'rateLimited',
        retryMinutes: retryMinutes(result.retryAfterSeconds),
        email: parsed.email,
      };
    }
  } catch (error) {
    return membersErrorToState(error);
  }
  revalidatePath('/app/members');
  return { status: 'sent' };
}

/** Gửi lại (token mới, token cũ mất hiệu lực) hoặc thu hồi một lời mời đang chờ. */
export async function invitationAction(
  _previous: MembersFormState,
  data: FormData,
): Promise<MembersFormState> {
  const { user, workspace } = await requireAppUser(OWNER_ONLY);
  const intent = field(data, 'intent');
  const invitationId = field(data, 'invitationId');
  if ((intent !== 'resend' && intent !== 'revoke') || typeof invitationId !== 'string') notFound();
  try {
    const admin = getAuthRuntime().workspaceAdmin;
    const base = { workspaceId: workspace.id, actorUserId: user.id, invitationId };
    if (intent === 'revoke') {
      await admin.revokeInvitation(base);
    } else {
      const result = await admin.resendInvitation(base);
      if (result.status === 'rate_limited') {
        return {
          status: 'error',
          message: 'rateLimited',
          retryMinutes: retryMinutes(result.retryAfterSeconds),
        };
      }
    }
  } catch (error) {
    return membersErrorToState(error);
  }
  revalidatePath('/app/members');
  return { status: 'ok' };
}
