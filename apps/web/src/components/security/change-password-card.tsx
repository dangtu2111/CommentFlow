'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { changePasswordAction } from '../../app/app/security/actions';
import { cn } from '../../lib/cn';
import { SECURITY_IDLE } from '../../lib/security-form';
import {
  MIN_PASSWORD_LENGTH_HINT,
  passwordChecks,
  passwordStrength,
} from '../../lib/settings-visual';
import { TwDialog, TwDialogTrigger, TwSubmit } from '../settings/tw/dialog';
import { TwBanner, TwPasswordField } from '../settings/tw/fields';
import { twBtn } from '../settings/tw/ui';
import { Icon } from '../ui/icon';

const DIALOG_ID = 'change-password-dialog';
const CHECK_KEYS = ['length', 'mixedCase', 'digit', 'special'] as const;

/** Thanh độ mạnh bốn đoạn + danh sách kiểm (`settings-change-password-modal`). Chỉ gợi ý phía client; máy chủ vẫn quyết định. */
function StrengthMeter({ password }: { password: string }) {
  const t = useTranslations('auth.security.changePassword.strength');
  const checks = passwordChecks(password);
  const level = passwordStrength(password);
  return (
    <div className="p-3 rounded-xl bg-surface-container-low space-y-2" data-level={level}>
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm text-on-surface-variant">{t('title')}</span>
        <strong aria-live="polite" className="font-title-sm text-title-sm text-primary font-bold">
          {t(`level.${level}`)}
        </strong>
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1.5 rounded-full',
              step <= level ? 'bg-primary-container' : 'bg-surface-container-highest',
            )}
          />
        ))}
      </div>
      <ul className="pt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5 font-label-sm text-label-sm">
        {CHECK_KEYS.map((key) => (
          <li
            key={key}
            className={cn(
              'flex items-center gap-1.5',
              checks[key] ? 'text-primary' : 'text-on-surface-variant',
            )}
          >
            <Icon name={checks[key] ? 'check_circle' : 'cancel'} size={16} />
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
    <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
        <span
          aria-hidden="true"
          className="w-10 h-10 rounded-lg bg-surface-container-lowest text-on-surface-variant flex items-center justify-center"
        >
          <Icon name="password" size={20} />
        </span>
        <div>
          <h3 className="font-title-sm text-title-sm text-on-surface">{t('title')}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t('body')}</p>
        </div>
      </div>
      <TwDialogTrigger dialogId={DIALOG_ID} className={twBtn({ tone: 'plain' })}>
        <Icon name="edit_square" size={16} />
        {t('open')}
      </TwDialogTrigger>
      <TwDialog
        dialogId={DIALOG_ID}
        title={t('dialogTitle')}
        description={t('dialogBody')}
        icon={<Icon name="shield_lock" size={20} />}
        size="lg"
      >
        <form
          action={action}
          noValidate
          className="space-y-4"
          onReset={() => {
            // React xóa ô nhập sau khi Server Action chạy xong; đồng bộ lại để thanh độ mạnh không dùng giá trị cũ.
            setNext('');
            setConfirm('');
          }}
        >
          {state.status === 'error' ? (
            <TwBanner tone="danger">
              {errors(state.message, { minutes: state.retryMinutes ?? 15 })}
            </TwBanner>
          ) : null}
          <TwPasswordField
            name="currentPassword"
            label={t('currentLabel')}
            autoComplete="current-password"
          />
          <TwPasswordField
            name="newPassword"
            label={t('newLabel')}
            hint={t('newHint')}
            icon="password"
            autoComplete="new-password"
            onValueChange={setNext}
          />
          <StrengthMeter password={next} />
          <TwPasswordField
            name="confirmPassword"
            label={t('confirmLabel')}
            icon="check_circle"
            autoComplete="new-password"
            onValueChange={setConfirm}
          />
          {confirm !== '' ? (
            <p
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold',
                confirm === next
                  ? 'bg-surface-container-high text-primary'
                  : 'bg-error-container text-on-error-container',
              )}
            >
              <Icon name={confirm === next ? 'check_circle' : 'cancel'} size={14} />
              {confirm === next ? t('match.yes') : t('match.no')}
            </p>
          ) : null}
          <div className="flex justify-end">
            <TwSubmit>{t('submit')}</TwSubmit>
          </div>
        </form>
      </TwDialog>
    </div>
  );
}
