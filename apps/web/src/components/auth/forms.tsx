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
import { Banner } from '../ui/banner';
import { PasswordField, TextField } from '../ui/fields';
import { SubmitButton } from '../ui/submit-button';

/** Lỗi gắn với một ô thì hiện dưới ô đó; lỗi chung (sai mật khẩu, quá nhiều lần...) hiện ở dải trên form. */
function useFormErrors(state: FormState) {
  const t = useTranslations('auth.errors');
  const message = state.status === 'error' ? t(state.message) : undefined;
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
    <div className="stack">
      {state.status === 'sent' ? <Banner variant="success">{t('resent')}</Banner> : null}
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <SubmitButton variant="secondary">{t('resend')}</SubmitButton>
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
          <Banner variant="warning">{t('errors.emailNotVerified')}</Banner>
          <ResendVerificationForm email={state.email} />
        </>
      ) : null}
      <form action={action} className="form" noValidate>
        {errors.banner ? <Banner variant="danger">{errors.banner}</Banner> : null}
        <TextField
          name="email"
          type="email"
          icon="mail"
          label={t('fields.email')}
          placeholder={t('fields.emailPlaceholder')}
          autoComplete="email"
          defaultValue={values.email}
          error={errors.forField('email')}
        />
        <PasswordField
          name="password"
          label={t('fields.password')}
          autoComplete="current-password"
          error={errors.forField('password')}
          aux={<Link href="/forgot-password">{t('login.forgot')}</Link>}
        />
        <SubmitButton>{t('login.submit')}</SubmitButton>
      </form>
    </>
  );
}

export function RegisterForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(registerAction, IDLE);
  const errors = useFormErrors(state);
  const values = valuesOf(state);
  return (
    <form action={action} className="form" noValidate>
      {errors.banner ? <Banner variant="danger">{errors.banner}</Banner> : null}
      <TextField
        name="name"
        icon="user"
        label={t('fields.name')}
        placeholder={t('fields.namePlaceholder')}
        autoComplete="name"
        defaultValue={'name' in values ? values.name : undefined}
        error={errors.forField('name')}
      />
      <TextField
        name="email"
        type="email"
        icon="mail"
        label={t('fields.email')}
        placeholder={t('fields.emailPlaceholder')}
        autoComplete="email"
        defaultValue={values.email}
        error={errors.forField('email')}
      />
      <PasswordField
        name="password"
        label={t('fields.password')}
        hint={t('fields.passwordHint')}
        autoComplete="new-password"
        error={errors.forField('password')}
      />
      <SubmitButton>{t('register.submit')}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(forgotPasswordAction, IDLE);
  const errors = useFormErrors(state);
  const values = valuesOf(state);
  if (state.status === 'sent') return <Banner variant="success">{t('forgot.sent')}</Banner>;
  return (
    <form action={action} className="form" noValidate>
      {errors.banner ? <Banner variant="danger">{errors.banner}</Banner> : null}
      <TextField
        name="email"
        type="email"
        icon="mail"
        label={t('fields.email')}
        placeholder={t('fields.emailPlaceholder')}
        autoComplete="email"
        defaultValue={values.email}
        error={errors.forField('email')}
      />
      <SubmitButton>{t('forgot.submit')}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(resetPasswordAction, IDLE);
  const errors = useFormErrors(state);
  return (
    <form action={action} className="form" noValidate>
      {errors.banner ? <Banner variant="danger">{errors.banner}</Banner> : null}
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label={t('fields.newPassword')}
        hint={t('fields.passwordHint')}
        autoComplete="new-password"
        error={errors.forField('password')}
      />
      <PasswordField
        name="passwordConfirm"
        label={t('fields.passwordConfirm')}
        autoComplete="new-password"
        error={errors.forField('passwordConfirm')}
      />
      <SubmitButton>{t('reset.submit')}</SubmitButton>
    </form>
  );
}
