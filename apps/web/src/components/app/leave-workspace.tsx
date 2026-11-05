'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { leaveWorkspaceAction } from '../../app/app/(guarded)/leave/actions';
import { MEMBERS_IDLE, type MembersFormState } from '../../lib/members-form';
import { Banner } from '../ui/banner';

/** Nút "Rời workspace" với hộp xác nhận hai bước (mở mục xác nhận rồi mới bấm nút nguy hiểm). */
export function LeaveWorkspace({ lastOwner }: { lastOwner: boolean }) {
  const t = useTranslations('leave');
  const te = useTranslations('members.errors');
  const [state, action] = useActionState<MembersFormState>(leaveWorkspaceAction, MEMBERS_IDLE);
  const errorMessage = state.status === 'error' ? te(state.message) : null;
  return (
    <form action={action} className="stack">
      {errorMessage ? <Banner variant="danger">{errorMessage}</Banner> : null}
      {lastOwner ? (
        <>
          <p className="muted">{t('lastOwner')}</p>
          <Link href="/app/members" className="btn btn-secondary">
            {t('membersLink')}
          </Link>
        </>
      ) : (
        <details className="confirm">
          <summary className="btn btn-secondary">{t('button')}</summary>
          <p className="muted">{t('warning')}</p>
          <button type="submit" className="btn btn-danger">
            {t('confirm')}
          </button>
        </details>
      )}
    </form>
  );
}
