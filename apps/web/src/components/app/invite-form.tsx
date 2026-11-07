'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { inviteAction } from '../../app/app/(guarded)/members/actions';
import { MEMBERS_IDLE } from '../../lib/members-form';
import { TwSubmit } from '../settings/tw/dialog';
import { TwBanner } from '../settings/tw/fields';
import { twBtn } from '../settings/tw/ui';
import { Icon } from '../ui/icon';

const INVITE_ROLES = ['staff', 'owner'] as const;
const FIELD =
  'w-full bg-surface-container-low rounded-lg px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary-container aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error';

/** Mời theo email + vai trò (`settings-workspace-members`). Thông báo thành công luôn trung tính (không lộ email có tài khoản hay chưa). */
export function InviteForm() {
  const t = useTranslations('members.invite');
  const te = useTranslations('members.errors');
  const tr = useTranslations('members.roles');
  const [state, action] = useActionState(inviteAction, MEMBERS_IDLE);
  const emailId = useId();
  const roleId = useId();
  const error = state.status === 'error' ? state : null;
  const emailError = error && error.message === 'emailInvalid' ? te('emailInvalid') : undefined;
  const bannerError =
    error && error.message !== 'emailInvalid'
      ? te(error.message, { minutes: error.retryMinutes ?? 1 })
      : undefined;
  return (
    <form action={action} className="space-y-space-md" noValidate>
      {state.status === 'sent' ? <TwBanner tone="success">{t('sent')}</TwBanner> : null}
      {bannerError ? <TwBanner tone="danger">{bannerError}</TwBanner> : null}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <div className="space-y-1">
          <label htmlFor={emailId} className="font-title-sm text-title-sm text-on-surface">
            {t('email')}
          </label>
          <input
            key={state.status === 'sent' ? 'sent' : 'typing'}
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('emailPlaceholder')}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${emailId}-error` : undefined}
            defaultValue={error?.email ?? ''}
            className={FIELD}
          />
          {emailError ? (
            <p
              id={`${emailId}-error`}
              role="alert"
              className="font-body-sm text-body-sm text-error"
            >
              {emailError}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <label htmlFor={roleId} className="font-title-sm text-title-sm text-on-surface">
            {t('role')}
          </label>
          <select
            id={roleId}
            name="role"
            defaultValue="staff"
            className={`${FIELD} cursor-pointer`}
          >
            {INVITE_ROLES.map((role) => (
              <option key={role} value={role}>
                {tr(role)}
              </option>
            ))}
          </select>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t('roleHint')}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="reset" className={twBtn({ tone: 'soft' })}>
          {t('cancel')}
        </button>
        <TwSubmit>
          <Icon name="send" size={16} />
          {t('submit')}
        </TwSubmit>
      </div>
    </form>
  );
}
