'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '../../../lib/cn';
import { Icon, type IconName } from '../../ui/icon';

const INPUT_CLASS =
  'w-full pl-9 pr-10 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-container transition-all aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error';

function FieldShell({
  id,
  label,
  hint,
  error,
  aux,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  aux?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-title-sm text-title-sm text-on-surface">
          {label}
        </label>
        {aux}
      </div>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="font-body-sm text-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="font-body-sm text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ô mật khẩu Tailwind có nút hiện/ẩn (giữ `name`, `autoComplete`, `onValueChange` như `PasswordField` cũ). */
export function TwPasswordField(props: {
  name: string;
  label: string;
  icon?: IconName;
  autoComplete?: string;
  hint?: string;
  error?: string;
  aux?: ReactNode;
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  const t = useTranslations('auth.fields');
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={props.label} hint={props.hint} error={props.error} aux={props.aux}>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
          <Icon name={props.icon ?? 'lock'} size={18} />
        </span>
        <input
          id={id}
          name={props.name}
          type={visible ? 'text' : 'password'}
          autoComplete={props.autoComplete}
          onChange={props.onValueChange ? (e) => props.onValueChange?.(e.target.value) : undefined}
          required
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined}
          className={INPUT_CLASS}
        />
        <button
          type="button"
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface"
        >
          <Icon name={visible ? 'visibility_off' : 'visibility'} size={18} />
        </button>
      </div>
    </FieldShell>
  );
}

/** Ô nhập mã xác thực (6 số hoặc mã dự phòng): bàn phím số + gợi ý điền mã một lần của hệ điều hành. */
export function TwCodeField(props: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  variant?: 'totp' | 'backup';
}) {
  const id = useId();
  const backup = props.variant === 'backup';
  return (
    <FieldShell id={id} label={props.label} hint={props.hint} error={props.error}>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
          <Icon name="shield_lock" size={18} />
        </span>
        <input
          id={id}
          name={props.name}
          type="text"
          inputMode={backup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          maxLength={backup ? 16 : 10}
          required
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined}
          className={cn(INPUT_CLASS, 'pr-3 font-code-sm text-code-sm tracking-widest')}
        />
      </div>
    </FieldShell>
  );
}

const BANNER_TONES = {
  danger: 'bg-error-container text-on-error-container',
  warning: 'bg-[#FFF4E5] text-[#77440B]',
  success: 'bg-[#EBF7ED] text-[#237A36]',
  info: 'bg-surface-container-low text-on-surface-variant',
} as const;

/** Khối thông báo trong hộp thoại/thẻ (lỗi, cảnh báo, thành công). */
export function TwBanner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof BANNER_TONES;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'p-space-md rounded-lg flex items-start gap-2 font-body-sm text-body-sm',
        BANNER_TONES[tone],
      )}
    >
      <span className="shrink-0 mt-0.5">
        <Icon name={icon ?? (tone === 'success' ? 'check_circle' : 'warning')} size={16} />
      </span>
      <div>{children}</div>
    </div>
  );
}
