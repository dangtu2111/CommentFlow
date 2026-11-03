'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { invitationAction } from '../../app/app/(guarded)/members/actions';
import { MEMBERS_IDLE } from '../../lib/members-form';
import { Banner } from '../ui/banner';

/** Gửi lại (token mới, token cũ mất hiệu lực) hoặc thu hồi một lời mời đang chờ. */
export function InvitationActions({ invitationId }: { invitationId: string }) {
  const t = useTranslations('members.pending');
  const te = useTranslations('members.errors');
  const [state, action] = useActionState(invitationAction, MEMBERS_IDLE);
  const errorMessage =
    state.status === 'error' ? te(state.message, { minutes: state.retryMinutes ?? 1 }) : null;
  return (
    <form action={action} className="member-actions">
      <input type="hidden" name="invitationId" value={invitationId} />
      {errorMessage ? <Banner variant="danger">{errorMessage}</Banner> : null}
      <div className="row">
        <button type="submit" name="intent" value="resend" className="btn btn-secondary">
          {t('resend')}
        </button>
        <button type="submit" name="intent" value="revoke" className="btn btn-secondary">
          {t('revoke')}
        </button>
      </div>
    </form>
  );
}
