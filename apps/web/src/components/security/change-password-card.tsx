'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { changePasswordAction } from '../../app/app/security/actions';
import { SECURITY_IDLE } from '../../lib/security-form';
import { Banner } from '../ui/banner';
import { PasswordField } from '../ui/fields';
import { SubmitButton } from '../ui/submit-button';

/** Đổi mật khẩu (FR-001). Thành công → Server Action chuyển về /login nên không có trạng thái "xong" ở đây. */
export function ChangePasswordCard() {
  const t = useTranslations('auth.security.changePassword');
  const errors = useTranslations('auth.errors');
  const [state, action] = useActionState(changePasswordAction, SECURITY_IDLE);
  return (
    <section className="card stack" aria-labelledby="change-password-title">
      <h2 id="change-password-title" className="section-title">
        {t('title')}
      </h2>
      <p className="muted">{t('body')}</p>
      <form action={action} className="form" noValidate>
        {state.status === 'error' ? (
          <Banner variant="danger">
            {errors(state.message, { minutes: state.retryMinutes ?? 15 })}
          </Banner>
        ) : null}
        <PasswordField
          name="currentPassword"
          label={t('currentLabel')}
          autoComplete="current-password"
        />
        <PasswordField
          name="newPassword"
          label={t('newLabel')}
          hint={t('newHint')}
          autoComplete="new-password"
        />
        <PasswordField
          name="confirmPassword"
          label={t('confirmLabel')}
          autoComplete="new-password"
        />
        <SubmitButton block={false}>{t('submit')}</SubmitButton>
      </form>
    </section>
  );
}
