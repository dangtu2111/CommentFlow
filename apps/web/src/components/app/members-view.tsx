import { MailPlus, Users } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { roleTone } from '../../lib/settings-visual';
import { userInitials } from '../../lib/user-initials';
import { SectionHead } from '../ui/section-head';
import { InvitationActions } from './invitation-actions';
import { InviteForm } from './invite-form';
import { MemberActions } from './member-actions';

export type MemberRowView = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  status: 'active' | 'suspended';
};

export type InvitationRowView = {
  id: string;
  email: string;
  role: 'owner' | 'staff';
  expired: boolean;
  expiresAt: Date;
};

/** Phần trình bày trang Thành viên (tách khỏi `page.tsx` để trang xem mẫu `/dev/ui/members` dùng lại; không đọc dữ liệu). */
export async function MembersView({
  currentUserId,
  workspaceName,
  members,
  invitations,
}: {
  currentUserId: string;
  workspaceName: string;
  members: MemberRowView[];
  invitations: InvitationRowView[];
}) {
  const [t, format] = await Promise.all([getTranslations('members'), getFormatter()]);
  const activeOwners = members.filter((m) => m.role === 'owner' && m.status === 'active').length;
  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <p className="page-subtitle">{t('subtitle', { workspace: workspaceName })}</p>

      <section className="card stack" aria-labelledby="members-title">
        <SectionHead
          id="members-title"
          icon={<Users size={22} />}
          title={t('list.title')}
          end={<span className="chip chip-info">{t('list.count', { count: members.length })}</span>}
        />
        <ul className="member-list">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <li key={member.memberId} className="member-item">
                <span className="avatar" aria-hidden="true">
                  {userInitials(member.name || member.email)}
                </span>
                <div className="member-info">
                  <p className="member-name">
                    {member.name || t('list.unknownName')}
                    {isSelf ? <span className="chip chip-muted">{t('list.you')}</span> : null}
                  </p>
                  <p className="muted">{member.email || t('list.emailHidden')}</p>
                </div>
                <div className="member-chips">
                  <span
                    className={`chip ${roleTone(member.role) === 'owner' ? 'chip-info' : 'chip-muted'}`}
                  >
                    {t(`roles.${member.role}`)}
                  </span>
                  <span
                    className={`chip ${member.status === 'active' ? 'chip-success' : 'chip-warning'}`}
                  >
                    {t(`status.${member.status}`)}
                  </span>
                </div>
                {isSelf ? (
                  <p className="muted member-self">{t('list.selfNote')}</p>
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
        <SectionHead
          id="invite-title"
          icon={<MailPlus size={22} />}
          title={t('invite.title')}
          description={t('invite.body')}
        />
        <InviteForm />
      </section>

      <section className="card stack" aria-labelledby="pending-title">
        <SectionHead id="pending-title" icon={<MailPlus size={22} />} title={t('pending.title')} />
        {invitations.length === 0 ? <p className="muted">{t('pending.empty')}</p> : null}
        <ul className="member-list">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="member-item">
              <span className="avatar" aria-hidden="true">
                {userInitials(invitation.email)}
              </span>
              <div className="member-info">
                <p className="member-name">{invitation.email}</p>
                <p className="muted">
                  {t('pending.expiresAt', {
                    date: format.dateTime(invitation.expiresAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              </div>
              <div className="member-chips">
                <span className="chip chip-muted">{t(`roles.${invitation.role}`)}</span>
                <span className={`chip ${invitation.expired ? 'chip-warning' : 'chip-success'}`}>
                  {invitation.expired ? t('pending.expired') : t('pending.waiting')}
                </span>
              </div>
              <InvitationActions invitationId={invitation.id} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
