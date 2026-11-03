'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { memberAction } from '../../app/app/(guarded)/members/actions';
import { MEMBERS_IDLE } from '../../lib/members-form';
import { Banner } from '../ui/banner';

/** Nút thao tác của một thành viên: đổi vai trò, tạm khóa/mở khóa, gỡ (gỡ cần bấm xác nhận lần hai). */
export function MemberActions({
  memberId,
  role,
  status,
  lastOwner,
}: {
  memberId: string;
  role: 'owner' | 'staff';
  status: 'active' | 'suspended';
  /** Owner đang hoạt động cuối cùng: không hạ/khóa/gỡ được (DB cũng chặn). */
  lastOwner: boolean;
}) {
  const t = useTranslations('members.actions');
  const te = useTranslations('members.errors');
  const [state, action] = useActionState(memberAction, MEMBERS_IDLE);
  const errorMessage = state.status === 'error' ? te(state.message) : null;
  return (
    <form action={action} className="member-actions">
      <input type="hidden" name="memberId" value={memberId} />
      {errorMessage ? <Banner variant="danger">{errorMessage}</Banner> : null}
      {lastOwner ? <p className="muted">{t('lastOwner')}</p> : null}
      {lastOwner ? null : (
        <div className="row">
          {role === 'staff' ? (
            <button type="submit" name="intent" value="make-owner" className="btn btn-secondary">
              {t('makeOwner')}
            </button>
          ) : (
            <button type="submit" name="intent" value="make-staff" className="btn btn-secondary">
              {t('makeStaff')}
            </button>
          )}
          {status === 'active' ? (
            <button type="submit" name="intent" value="suspend" className="btn btn-secondary">
              {t('suspend')}
            </button>
          ) : (
            <button type="submit" name="intent" value="restore" className="btn btn-secondary">
              {t('restore')}
            </button>
          )}
          <details className="confirm">
            <summary className="btn btn-secondary">{t('remove')}</summary>
            <p className="muted">{t('removeWarning')}</p>
            <button type="submit" name="intent" value="remove" className="btn btn-danger">
              {t('removeConfirm')}
            </button>
          </details>
        </div>
      )}
    </form>
  );
}
