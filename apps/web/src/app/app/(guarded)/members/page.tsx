import { getFormatter, getTranslations } from 'next-intl/server';
import { InvitationActions } from '../../../../components/app/invitation-actions';
import { InviteForm } from '../../../../components/app/invite-form';
import { MemberActions } from '../../../../components/app/member-actions';
import { getAuthRuntime } from '../../../../server/auth';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('members');
  return { title: `${t('title')} · ${(await getTranslations('auth'))('brand')}` };
}

/** Trang Thành viên (chỉ Owner; Staff nhận 404 — docs/13 §3.1): danh sách, đổi vai trò, tạm khóa, gỡ, lời mời. */
export default async function MembersPage() {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const admin = getAuthRuntime().workspaceAdmin;
  const input = { workspaceId: workspace.id, actorUserId: user.id };
  const [members, invitations, t, format] = await Promise.all([
    admin.listMembers(input),
    admin.listInvitations(input),
    getTranslations('members'),
    getFormatter(),
  ]);
  const activeOwners = members.filter((m) => m.role === 'owner' && m.status === 'active').length;
  return (
    <main className="app-page app-page-wide">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle', { workspace: workspace.name })}</p>

      <section className="card stack" aria-labelledby="members-title">
        <h2 id="members-title" className="section-title">
          {t('list.title')}
        </h2>
        <ul className="member-list">
          {members.map((member) => {
            const isSelf = member.userId === user.id;
            return (
              <li key={member.memberId} className="member-item">
                <div className="member-info">
                  <p className="member-name">
                    {member.name || t('list.unknownName')}
                    {isSelf ? <span className="badge badge-on">{t('list.you')}</span> : null}
                  </p>
                  <p className="muted">{member.email || t('list.emailHidden')}</p>
                  <p>
                    <span className="badge badge-off">{t(`roles.${member.role}`)}</span>{' '}
                    <span
                      className={member.status === 'active' ? 'badge badge-on' : 'badge badge-off'}
                    >
                      {t(`status.${member.status}`)}
                    </span>
                  </p>
                </div>
                {isSelf ? (
                  <p className="muted">{t('list.selfNote')}</p>
                ) : (
                  <MemberActions
                    memberId={member.memberId}
                    role={member.role}
                    status={member.status}
                    lastOwner={
                      member.role === 'owner' && member.status === 'active' && activeOwners <= 1
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="invite-title">
        <h2 id="invite-title" className="section-title">
          {t('invite.title')}
        </h2>
        <p className="muted">{t('invite.body')}</p>
        <InviteForm />
      </section>

      <section className="card stack" aria-labelledby="pending-title">
        <h2 id="pending-title" className="section-title">
          {t('pending.title')}
        </h2>
        {invitations.length === 0 ? <p className="muted">{t('pending.empty')}</p> : null}
        <ul className="member-list">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="member-item">
              <div className="member-info">
                <p className="member-name">{invitation.email}</p>
                <p>
                  <span className="badge badge-off">{t(`roles.${invitation.role}`)}</span>{' '}
                  <span className={invitation.expired ? 'badge badge-off' : 'badge badge-on'}>
                    {invitation.expired ? t('pending.expired') : t('pending.waiting')}
                  </span>
                </p>
                <p className="muted">
                  {t('pending.expiresAt', {
                    date: format.dateTime(invitation.expiresAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              </div>
              <InvitationActions invitationId={invitation.id} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
