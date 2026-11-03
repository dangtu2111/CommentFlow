'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { inviteAction } from '../../app/app/(guarded)/members/actions';
import { MEMBERS_IDLE } from '../../lib/members-form';
import { Banner } from '../ui/banner';
import { TextField } from '../ui/fields';
import { SubmitButton } from '../ui/submit-button';

const INVITE_ROLES = ['staff', 'owner'] as const;

/** Mời theo email + vai trò. Thông báo thành công luôn trung tính (không lộ email có tài khoản hay chưa). */
export function InviteForm() {
  const t = useTranslations('members.invite');
  const te = useTranslations('members.errors');
  const tr = useTranslations('members.roles');
  const [state, action] = useActionState(inviteAction, MEMBERS_IDLE);
  const error = state.status === 'error' ? state : null;
  const emailError = error && error.message === 'emailInvalid' ? te('emailInvalid') : undefined;
  const bannerError =
    error && error.message !== 'emailInvalid'
      ? te(error.message, { minutes: error.retryMinutes ?? 1 })
      : undefined;
  return (
    <form action={action} className="form" noValidate>
      {state.status === 'sent' ? <Banner variant="success">{t('sent')}</Banner> : null}
      {bannerError ? <Banner variant="danger">{bannerError}</Banner> : null}
      <TextField
        key={state.status === 'sent' ? 'sent' : 'typing'}
        name="email"
        type="email"
        icon="mail"
        label={t('email')}
        autoComplete="off"
        placeholder={t('emailPlaceholder')}
        {...(error?.email ? { defaultValue: error.email } : {})}
        {...(emailError ? { error: emailError } : {})}
      />
      <div className="field">
        <label className="field-label" htmlFor="invite-role">
          {t('role')}
        </label>
        <select id="invite-role" className="input" name="role" defaultValue="staff">
          {INVITE_ROLES.map((role) => (
            <option key={role} value={role}>
              {tr(role)}
            </option>
          ))}
        </select>
        <p className="field-hint">{t('roleHint')}</p>
      </div>
      <SubmitButton block={false}>{t('submit')}</SubmitButton>
    </form>
  );
}
