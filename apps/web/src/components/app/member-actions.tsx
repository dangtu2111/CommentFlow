'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { memberAction } from '../../app/app/(guarded)/members/actions';
import { MEMBERS_IDLE } from '../../lib/members-form';
import { TwBanner } from '../settings/tw/fields';

const LINK_BTN = 'p-1 rounded hover:bg-surface-container text-primary font-label-sm text-label-sm';
const DANGER_BTN = 'p-1 rounded hover:bg-error-container text-error font-label-sm text-label-sm';

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
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="memberId" value={memberId} />
      {errorMessage ? <TwBanner tone="danger">{errorMessage}</TwBanner> : null}
      {lastOwner ? (
        <p className="font-label-sm text-label-sm text-on-surface-variant italic max-w-xs text-right">
          {t('lastOwner')}
        </p>
      ) : (
        <div className="inline-flex items-center gap-1 flex-wrap justify-end">
          {role === 'staff' ? (
            <button type="submit" name="intent" value="make-owner" className={LINK_BTN}>
              {t('makeOwner')}
            </button>
          ) : (
            <button type="submit" name="intent" value="make-staff" className={LINK_BTN}>
              {t('makeStaff')}
            </button>
          )}
          {status === 'active' ? (
            <button type="submit" name="intent" value="suspend" className={LINK_BTN}>
              {t('suspend')}
            </button>
          ) : (
            <button type="submit" name="intent" value="restore" className={LINK_BTN}>
              {t('restore')}
            </button>
          )}
          <details className="relative">
            <summary className={`${DANGER_BTN} cursor-pointer list-none`}>{t('remove')}</summary>
            <div className="absolute right-0 z-10 mt-1 w-64 p-space-md rounded-xl bg-surface-container-lowest shadow-xl space-y-2 text-left">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('removeWarning')}
              </p>
              <button
                type="submit"
                name="intent"
                value="remove"
                className="px-3 py-1.5 rounded-lg bg-error text-on-error hover:bg-on-error-container font-title-sm text-title-sm"
              >
                {t('removeConfirm')}
              </button>
            </div>
          </details>
        </div>
      )}
    </form>
  );
}
