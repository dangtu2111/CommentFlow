'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { invitationAction } from '../../app/app/(guarded)/members/actions';
import { MEMBERS_IDLE } from '../../lib/members-form';
import { TwBanner } from '../settings/tw/fields';

/** Gửi lại (token mới, token cũ mất hiệu lực) hoặc thu hồi một lời mời đang chờ. */
export function InvitationActions({ invitationId }: { invitationId: string }) {
  const t = useTranslations('members.pending');
  const te = useTranslations('members.errors');
  const [state, action] = useActionState(invitationAction, MEMBERS_IDLE);
  const errorMessage =
    state.status === 'error' ? te(state.message, { minutes: state.retryMinutes ?? 1 }) : null;
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      {errorMessage ? <TwBanner tone="danger">{errorMessage}</TwBanner> : null}
      <div className="inline-flex items-center gap-1">
        <button
          type="submit"
          name="intent"
          value="resend"
          className="px-2 py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-primary font-label-sm text-label-sm"
        >
          {t('resend')}
        </button>
        <button
          type="submit"
          name="intent"
          value="revoke"
          className="px-2 py-1 rounded hover:bg-error-container text-error font-label-sm text-label-sm"
        >
          {t('revoke')}
        </button>
      </div>
    </form>
  );
}
