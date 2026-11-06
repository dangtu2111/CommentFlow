'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
} from '../../app/(auth)/actions';
import { type FormState, IDLE } from '../../lib/auth-form';
import { Icon } from '../ui/icon';
import { AuthNotice, AuthPasswordField, AuthSubmit, AuthTextField, SoonField } from './auth-fields';

const FORM = 'flex flex-col gap-space-md';
const CATEGORY_KEYS = ['fashion', 'beauty', 'fnb', 'home', 'agency', 'other'] as const;

/** Lỗi gắn với một ô thì hiện dưới ô đó; lỗi chung (sai mật khẩu, quá nhiều lần...) hiện ở dải trên form. */
function useFormErrors(state: FormState) {
  const t = useTranslations('auth.errors');
  const message =
    state.status === 'error' ? t(state.message, { minutes: state.retryMinutes ?? 15 }) : undefined;
  const field = state.status === 'error' ? state.field : undefined;
  return {
    banner: state.status === 'error' && !field ? message : undefined,
    forField: (name: string) => (field === name ? message : undefined),
  };
}

function valuesOf(state: FormState) {
  if (state.status === 'error') return state.values ?? {};
  if (state.status === 'unverified') return { email: state.email };
  return {};
}

/** Nút "Gửi lại thư xác minh" cho một địa chỉ đã biết (form riêng, không lồng trong form khác). */
export function ResendVerificationForm({ email }: { email: string }) {
  const t = useTranslations('auth.checkEmail');
  const [state, action] = useActionState(resendVerificationAction, IDLE);
  return (
    <div className="flex flex-col gap-space-sm">
      {state.status === 'sent' ? <AuthNotice tone="success">{t('resent')}</AuthNotice> : null}
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <AuthSubmit tone="neutral">{t('resend')}</AuthSubmit>
      </form>
    </div>
  );
}

export function LoginForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(loginAction, IDLE);
  const errors = useFormErrors(state);
  const values = valuesOf(state);
  return (
    <>
      {state.status === 'unverified' ? (
        <>
          <AuthNotice tone="warning">{t('errors.emailNotVerified')}</AuthNotice>
          <ResendVerificationForm email={state.email} />
        </>
      ) : null}
      <form action={action} className={FORM} noValidate>
        {errors.banner ? <AuthNotice tone="danger">{errors.banner}</AuthNotice> : null}
        <AuthTextField
          name="email"
          type="email"
          icon="mail"
          label={t('fields.email')}
          placeholder={t('fields.emailPlaceholder')}
          autoComplete="email"
          defaultValue={values.email}
          error={errors.forField('email')}
        />
        <AuthPasswordField
          name="password"
          label={t('fields.password')}
          autoComplete="current-password"
          error={errors.forField('password')}
          aux={<Link href="/forgot-password">{t('login.forgot')}</Link>}
        />
        <label className="flex cursor-not-allowed select-none items-center gap-2 opacity-70">
          <input
            type="checkbox"
            disabled
            aria-disabled="true"
            title={t('ui.soon')}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {t('ui.form.remember')} · {t('ui.soon')}
          </span>
        </label>
        <AuthSubmit>
          {t('login.submit')}
          <Icon name="arrow_forward" size={18} />
        </AuthSubmit>
      </form>
    </>
  );
}

export function RegisterForm({ sample = false }: { sample?: boolean }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(registerAction, IDLE);
  const errors = useFormErrors(state);
  const values = valuesOf(state);
  return (
    <form action={action} className={FORM} noValidate>
      {sample ? (
        <div className="flex items-center gap-space-xs rounded-lg bg-secondary-fixed/40 p-space-sm">
          <span className="text-secondary">
            <Icon name="stars" size={20} />
          </span>
          <span className="font-label-sm text-label-sm text-on-surface">
            {t('ui.form.trialBanner')}
          </span>
        </div>
      ) : null}
      {errors.banner ? <AuthNotice tone="danger">{errors.banner}</AuthNotice> : null}
      <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
        <AuthTextField
          name="name"
          icon="person"
          label={t('fields.name')}
          placeholder={t('fields.namePlaceholder')}
          autoComplete="name"
          defaultValue={'name' in values ? values.name : undefined}
          error={errors.forField('name')}
        />
        <SoonField label={t('ui.form.storeName')} soon={t('ui.soon')} />
      </div>
      <AuthTextField
        name="email"
        type="email"
        icon="mail"
        label={t('fields.email')}
        placeholder={t('fields.emailPlaceholder')}
        autoComplete="email"
        defaultValue={values.email}
        error={errors.forField('email')}
      />
      <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
        <AuthPasswordField
          name="password"
          label={t('fields.password')}
          hint={t('fields.passwordHint')}
          autoComplete="new-password"
          error={errors.forField('password')}
        />
        <SoonField label={t('ui.form.category')} soon={t('ui.soon')} select>
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`ui.form.categories.${key}`)}
            </option>
          ))}
        </SoonField>
      </div>
      <AuthSubmit tone="secondary">
        <Icon name="rocket_launch" size={18} />
        {t('register.submit')}
      </AuthSubmit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(forgotPasswordAction, IDLE);
  const errors = useFormErrors(state);
  const values = valuesOf(state);
  if (state.status === 'sent') return <AuthNotice tone="success">{t('forgot.sent')}</AuthNotice>;
  return (
    <form action={action} className={FORM} noValidate>
      {errors.banner ? <AuthNotice tone="danger">{errors.banner}</AuthNotice> : null}
      <AuthTextField
        name="email"
        type="email"
        icon="mail"
        label={t('fields.email')}
        placeholder={t('fields.emailPlaceholder')}
        autoComplete="email"
        defaultValue={values.email}
        error={errors.forField('email')}
      />
      <AuthSubmit>{t('forgot.submit')}</AuthSubmit>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(resetPasswordAction, IDLE);
  const errors = useFormErrors(state);
  return (
    <form action={action} className={FORM} noValidate>
      {errors.banner ? <AuthNotice tone="danger">{errors.banner}</AuthNotice> : null}
      <input type="hidden" name="token" value={token} />
      <AuthPasswordField
        name="password"
        label={t('fields.newPassword')}
        hint={t('fields.passwordHint')}
        autoComplete="new-password"
        error={errors.forField('password')}
      />
      <AuthPasswordField
        name="passwordConfirm"
        label={t('fields.passwordConfirm')}
        autoComplete="new-password"
        error={errors.forField('passwordConfirm')}
      />
      <AuthSubmit>{t('reset.submit')}</AuthSubmit>
    </form>
  );
}
