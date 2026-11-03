'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { verifyTwoFactorAction } from '../../app/(auth)/actions';
import { IDLE } from '../../lib/auth-form';
import { Banner } from '../ui/banner';
import { CodeField } from '../ui/fields';
import { SubmitButton } from '../ui/submit-button';

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
    <form action={action} className="form" noValidate>
      {error ? <Banner variant="danger">{error}</Banner> : null}
      <input type="hidden" name="kind" value={backup ? 'backup' : 'totp'} />
      <CodeField
        key={backup ? 'backup' : 'totp'}
        name="code"
        variant={backup ? 'backup' : 'totp'}
        label={backup ? t('twoFactor.backupLabel') : t('twoFactor.codeLabel')}
        hint={backup ? t('twoFactor.backupHint') : t('twoFactor.codeHint')}
      />
      <SubmitButton>{t('twoFactor.submit')}</SubmitButton>
      <button type="button" className="link-button" onClick={() => setBackup((value) => !value)}>
        {backup ? t('twoFactor.useApp') : t('twoFactor.useBackup')}
      </button>
      <p className="text-center">
        <Link href="/login">{t('twoFactor.back')}</Link>
      </p>
    </form>
  );
}
