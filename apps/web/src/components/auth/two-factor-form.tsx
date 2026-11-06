'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { verifyTwoFactorAction } from '../../app/(auth)/actions';
import { IDLE } from '../../lib/auth-form';
import { AuthCodeField, AuthNotice, AuthSubmit } from './auth-fields';

/** Bước 2 của đăng nhập: mã từ ứng dụng xác thực, hoặc mã dự phòng (chuyển qua lại không mất trang). */
export function TwoFactorForm() {
  const t = useTranslations('auth');
  const [backup, setBackup] = useState(false);
  const [state, action] = useActionState(verifyTwoFactorAction, IDLE);
  const error =
    state.status === 'error'
      ? t(`errors.${state.message}`, { minutes: state.retryMinutes ?? 15 })
      : undefined;
  return (
    <form action={action} className="flex flex-col gap-space-md" noValidate>
      {error ? <AuthNotice tone="danger">{error}</AuthNotice> : null}
      <input type="hidden" name="kind" value={backup ? 'backup' : 'totp'} />
      <AuthCodeField
        key={backup ? 'backup' : 'totp'}
        name="code"
        backup={backup}
        label={backup ? t('twoFactor.backupLabel') : t('twoFactor.codeLabel')}
        hint={backup ? t('twoFactor.backupHint') : t('twoFactor.codeHint')}
      />
      <AuthSubmit>{t('twoFactor.submit')}</AuthSubmit>
      <button
        type="button"
        className="font-label-md text-label-md text-primary hover:underline"
        onClick={() => setBackup((value) => !value)}
      >
        {backup ? t('twoFactor.useApp') : t('twoFactor.useBackup')}
      </button>
      <p className="text-center font-label-md text-label-md text-primary [&_a]:hover:underline">
        <Link href="/login">{t('twoFactor.back')}</Link>
      </p>
    </form>
  );
}
