import { getFormatter, getTranslations } from 'next-intl/server';
import { cn } from '../../lib/cn';
import { userInitials } from '../../lib/user-initials';
import { SettingsFrame, type SettingsFrameScope } from '../settings/settings-frame';
import { TwCard, TwChip, TwSoonButton } from '../settings/tw/ui';
import { Icon } from '../ui/icon';
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

const INVITE_ID = 'invite';
const INVITE_TITLE_ID = 'invite-title';
const LIST_TITLE_ID = 'members-title';
const MATRIX_TITLE_ID = 'matrix-title';
const PENDING_TITLE_ID = 'pending-title';
const MATRIX_ROWS = ['connect', 'kb', 'rules', 'stop', 'leads', 'billing'] as const;
/** Ô ma trận quyền: `yes` có quyền, `no` không, `mask` có nhưng che số điện thoại, `alert` quyền khẩn cấp ai cũng có. */
type Cell = 'yes' | 'no' | 'mask' | 'alert';
const MATRIX: Record<(typeof MATRIX_ROWS)[number], { owner: Cell; staff: Cell }> = {
  connect: { owner: 'yes', staff: 'no' },
  kb: { owner: 'yes', staff: 'no' },
  rules: { owner: 'yes', staff: 'no' },
  stop: { owner: 'alert', staff: 'alert' },
  leads: { owner: 'yes', staff: 'mask' },
  billing: { owner: 'yes', staff: 'no' },
};

async function MatrixCell({ cell }: { cell: Cell }) {
  const t = await getTranslations('members.matrix');
  if (cell === 'mask') {
    return (
      <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary">
        <Icon name="visibility_off" size={14} /> {t('mask')}
      </span>
    );
  }
  const tone = { yes: 'text-primary', no: 'text-outline-variant', alert: 'text-error' }[cell];
  return (
    <span className={cn('inline-flex', tone)}>
      <Icon name={cell === 'no' ? 'cancel' : 'check_circle'} size={16} />
      <span className="sr-only">{t(cell === 'no' ? 'denied' : 'allowed')}</span>
    </span>
  );
}

/** Phần trình bày trang Thành viên (tách khỏi `page.tsx` để trang xem mẫu `/dev/ui/members` dùng lại; không đọc dữ liệu). */
export async function MembersView({
  currentUserId,
  workspaceName,
  members,
  invitations,
  frame,
}: {
  frame: SettingsFrameScope;
  currentUserId: string;
  workspaceName: string;
  members: MemberRowView[];
  invitations: InvitationRowView[];
}) {
  const [t, format] = await Promise.all([getTranslations('members'), getFormatter()]);
  const activeOwners = members.filter((m) => m.role === 'owner' && m.status === 'active').length;
  return (
    <SettingsFrame
      {...frame}
      active="members"
      variant="tabs"
      workspaceName={workspaceName}
      headerEnd={
        <>
          <TwSoonButton tone="soft" soon={t('soon')}>
            <Icon name="menu_book" size={16} />
            {t('docs')}
          </TwSoonButton>
          <TwSoonButton tone="primary" soon={t('soon')}>
            <Icon name="check_circle" size={16} />
            {t('saveChanges')}
          </TwSoonButton>
        </>
      }
    >
      <TwCard labelledBy={LIST_TITLE_ID} className="p-space-lg space-y-space-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div>
            <div className="flex items-center gap-2">
              <h2 id={LIST_TITLE_ID} className="font-headline-sm text-headline-sm text-on-surface">
                {t('list.title')}
              </h2>
              <TwChip tone="muted" className="text-primary font-semibold">
                {t('list.count', { count: members.length })}
              </TwChip>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{t('list.body')}</p>
          </div>
          <a
            href={`#${INVITE_ID}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-title-sm text-title-sm shrink-0 transition-colors shadow-sm"
          >
            <Icon name="person_add" size={16} />
            {t('list.invite')}
          </a>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase">
              <tr>
                <th className="py-2.5 px-3">{t('table.person')}</th>
                <th className="py-2.5 px-3">{t('table.role')}</th>
                <th className="py-2.5 px-3">{t('table.permissions')}</th>
                <th className="py-2.5 px-3">{t('table.status')}</th>
                <th className="py-2.5 px-3 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="text-on-surface font-body-md text-body-md">
              {members.map((member, index) => {
                const isSelf = member.userId === currentUserId;
                return (
                  <tr
                    key={member.memberId}
                    className={cn(
                      'transition-colors hover:bg-surface-container-low',
                      index % 2 === 1
                        ? 'bg-surface-container-low/30'
                        : 'bg-surface-container-lowest',
                    )}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="w-9 h-9 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center font-title-sm text-title-sm shrink-0"
                        >
                          {userInitials(member.name || member.email)}
                        </span>
                        <div className="min-w-0">
                          <div className="font-title-sm text-title-sm text-on-surface flex items-center gap-1.5">
                            <span>{member.name || t('list.unknownName')}</span>
                            {isSelf ? <TwChip tone="muted">{t('list.you')}</TwChip> : null}
                          </div>
                          <div className="font-body-sm text-body-sm text-on-surface-variant truncate">
                            {member.email || t('list.emailHidden')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <TwChip
                        tone={member.role === 'owner' ? 'primary' : 'muted'}
                        className="px-2.5"
                      >
                        {t(`roles.${member.role}`)}
                      </TwChip>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={cn(
                          'font-body-sm text-body-sm',
                          member.role === 'owner'
                            ? 'text-primary font-semibold'
                            : 'text-on-surface-variant',
                        )}
                      >
                        {t(`permissions.${member.role}`)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-label-sm text-label-sm',
                          member.status === 'active' ? 'text-primary' : 'text-tertiary',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'w-2 h-2 rounded-full',
                            member.status === 'active'
                              ? 'bg-primary-container'
                              : 'bg-tertiary-container',
                          )}
                        />
                        {t(`status.${member.status}`)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isSelf ? (
                        <span
                          title={t('list.selfNote')}
                          className="font-label-sm text-label-sm text-on-surface-variant italic"
                        >
                          {t('list.locked')}
                        </span>
                      ) : (
                        <MemberActions
                          memberId={member.memberId}
                          role={member.role}
                          status={member.status}
                          lastOwner={
                            member.role === 'owner' &&
                            member.status === 'active' &&
                            activeOwners <= 1
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TwCard>

      <TwCard labelledBy={MATRIX_TITLE_ID} className="p-space-lg space-y-space-md">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-primary">
              <Icon name="shield" size={20} />
            </span>
            <h3 id={MATRIX_TITLE_ID} className="font-headline-sm text-headline-sm text-on-surface">
              {t('matrix.title')}
            </h3>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {t('matrix.version')}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-left">
            <thead className="bg-surface-container font-label-sm text-label-sm text-on-surface uppercase">
              <tr>
                <th className="py-2 px-3">{t('matrix.task')}</th>
                <th className="py-2 px-3 text-center">{t('roles.owner')}</th>
                <th className="py-2 px-3 text-center">{t('roles.staff')}</th>
                <th className="py-2 px-3">{t('matrix.rule')}</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-on-surface">
              {MATRIX_ROWS.map((row, index) => (
                <tr
                  key={row}
                  className={
                    index % 2 === 1 ? 'bg-surface-container-low/40' : 'bg-surface-container-lowest'
                  }
                >
                  <td
                    className={cn(
                      'py-2.5 px-3',
                      MATRIX[row].staff === 'alert' && 'font-semibold text-error',
                    )}
                  >
                    {t(`matrix.rows.${row}.task`)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <MatrixCell cell={MATRIX[row].owner} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <MatrixCell cell={MATRIX[row].staff} />
                  </td>
                  <td
                    className={cn(
                      'py-2.5 px-3',
                      MATRIX[row].staff === 'alert'
                        ? 'text-error font-medium'
                        : 'text-on-surface-variant',
                    )}
                  >
                    {t(`matrix.rows.${row}.rule`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TwCard>

      <TwCard labelledBy={INVITE_TITLE_ID} className="p-space-lg space-y-space-md">
        <div id={INVITE_ID} className="flex items-center gap-2 scroll-mt-20">
          <span className="text-primary">
            <Icon name="mark_email_read" size={20} />
          </span>
          <div>
            <h3 id={INVITE_TITLE_ID} className="font-headline-sm text-headline-sm text-on-surface">
              {t('invite.title')}
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{t('invite.body')}</p>
          </div>
        </div>
        <InviteForm />
      </TwCard>

      <TwCard labelledBy={PENDING_TITLE_ID} className="p-space-lg space-y-space-md">
        <div className="flex items-center gap-2">
          <span className="text-primary">
            <Icon name="send" size={20} />
          </span>
          <h3 id={PENDING_TITLE_ID} className="font-headline-sm text-headline-sm text-on-surface">
            {t('pending.title')}
          </h3>
        </div>
        {invitations.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">{t('pending.empty')}</p>
        ) : null}
        <ul className="space-y-space-sm">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="p-space-md rounded-xl bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-space-md"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden="true"
                  className="w-9 h-9 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center font-title-sm text-title-sm shrink-0"
                >
                  {userInitials(invitation.email)}
                </span>
                <div className="min-w-0">
                  <p className="font-title-sm text-title-sm text-on-surface truncate">
                    {invitation.email}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t('pending.expiresAt', {
                      date: format.dateTime(invitation.expiresAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <TwChip tone="muted">{t(`roles.${invitation.role}`)}</TwChip>
                <TwChip tone={invitation.expired ? 'warn' : 'ok'}>
                  {invitation.expired ? t('pending.expired') : t('pending.waiting')}
                </TwChip>
                <InvitationActions invitationId={invitation.id} />
              </div>
            </li>
          ))}
        </ul>
      </TwCard>
    </SettingsFrame>
  );
}
