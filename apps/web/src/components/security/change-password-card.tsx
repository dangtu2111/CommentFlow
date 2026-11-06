'use client';

import { Circle, CircleCheck, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { changePasswordAction } from '../../app/app/security/actions';
import { SECURITY_IDLE } from '../../lib/security-form';
import {
  MIN_PASSWORD_LENGTH_HINT,
  passwordChecks,
  passwordStrength,
} from '../../lib/settings-visual';
import { Banner } from '../ui/banner';
import { Dialog, DialogTrigger } from '../ui/dialog';
import { PasswordField } from '../ui/fields';
import { SectionHead } from '../ui/section-head';
import { SubmitButton } from '../ui/submit-button';

const DIALOG_ID = 'change-password-dialog';
const CHECK_KEYS = ['length', 'mixedCase', 'digit', 'special'] as const;

/** Thanh độ mạnh bốn đoạn + danh sách kiểm. Chỉ gợi ý phía client; máy chủ vẫn là nơi quyết định. */
function StrengthMeter({ password }: { password: string }) {
  const t = useTranslations('auth.security.changePassword.strength');
  const checks = passwordChecks(password);
  const level = passwordStrength(password);
  return (
    <div className="strength" data-level={level}>
      <div className="strength-head">
        <span>{t('title')}</span>
        <strong aria-live="polite">{t(`level.${level}`)}</strong>
      </div>
      <div className="strength-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={step <= level ? 'is-on' : undefined} />
        ))}
      </div>
      <ul className="strength-checks">
        {CHECK_KEYS.map((key) => (
          <li key={key} className={checks[key] ? 'is-ok' : undefined}>
            {checks[key] ? (
              <CircleCheck size={16} aria-hidden="true" />
            ) : (
              <Circle size={16} aria-hidden="true" />
            )}
            {t(`checks.${key}`, { min: MIN_PASSWORD_LENGTH_HINT })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Đổi mật khẩu (FR-001) trong hộp thoại. Thành công → Server Action chuyển về /login nên không có trạng thái "xong" ở đây.
 * Giữ nguyên tên trường form (`currentPassword`, `newPassword`, `confirmPassword`) của Server Action.
 */
export function ChangePasswordCard() {
  const t = useTranslations('auth.security.changePassword');
  const errors = useTranslations('auth.errors');
  const [state, action] = useActionState(changePasswordAction, SECURITY_IDLE);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <section className="card stack" aria-labelledby="change-password-title">
      <SectionHead
        id="change-password-title"
        icon={<KeyRound size={22} />}
        title={t('title')}
        description={t('body')}
        end={
          <DialogTrigger dialogId={DIALOG_ID} className="btn btn-secondary">
            {t('open')}
          </DialogTrigger>
        }
      />
      <Dialog
        dialogId={DIALOG_ID}
        title={t('dialogTitle')}
        description={t('dialogBody')}
        icon={<KeyRound size={22} />}
      >
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
            onValueChange={setNext}
          />
          <StrengthMeter password={next} />
          <PasswordField
            name="confirmPassword"
            label={t('confirmLabel')}
            autoComplete="new-password"
            onValueChange={setConfirm}
          />
          {confirm !== '' ? (
            <p className={`match ${confirm === next ? 'is-ok' : 'is-bad'}`} aria-live="polite">
              {confirm === next ? t('match.yes') : t('match.no')}
            </p>
          ) : null}
          <SubmitButton block={false}>{t('submit')}</SubmitButton>
        </form>
      </Dialog>
    </section>
  );
}
