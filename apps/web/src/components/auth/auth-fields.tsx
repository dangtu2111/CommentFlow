'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '../../lib/cn';
import { Icon, type IconName } from '../ui/icon';
import { type AuthButtonProps, authButton } from './auth-styles';

/**
 * Ô nhập/nút/thông báo của khung xác thực, dựng bằng class Tailwind chép từ `design/stitch/auth-login-register.html`
 * (chỉ chạy bên trong phần tử bọc `.tw`). Giữ hành vi của kit cũ: lỗi gắn bằng aria-invalid + aria-describedby,
 * ô mật khẩu có nút hiện/ẩn, nút gửi khóa khi Server Action đang chạy.
 */

const control =
  'h-11 w-full rounded-lg bg-surface-container-low font-body-md text-body-md text-on-surface outline-none transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error disabled:cursor-not-allowed disabled:opacity-70';

type ControlProps = { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string };

/** Khung một ô: nhãn (+ liên kết phụ cùng hàng) → điều khiển → gợi ý/lỗi. */
export function AuthField({
  label,
  aux,
  hint,
  error,
  children,
}: {
  label: string;
  aux?: ReactNode;
  hint?: string;
  error?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="font-label-md text-label-md text-on-surface" htmlFor={id}>
          {label}
        </label>
        {aux ? (
          <span className="font-label-sm text-label-sm text-primary [&_a]:hover:underline">
            {aux}
          </span>
        ) : null}
      </div>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': note ? noteId : undefined,
      })}
      {note ? (
        <p
          id={noteId}
          role={error ? 'alert' : undefined}
          className={cn(
            'font-label-sm text-label-sm',
            error ? 'text-error' : 'text-on-surface-variant',
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = {
  name: string;
  label: string;
  icon: IconName;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  aux?: ReactNode;
};

/** Ô văn bản/email có biểu tượng bên trái. */
export function AuthTextField({
  type = 'text',
  icon,
  name,
  autoComplete,
  placeholder,
  defaultValue,
  ...rest
}: FieldProps & { type?: 'text' | 'email' }) {
  return (
    <AuthField label={rest.label} aux={rest.aux} hint={rest.hint} error={rest.error}>
      {(a11y) => (
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-on-surface-variant">
            <Icon name={icon} size={18} />
          </span>
          <input
            {...a11y}
            className={cn(control, 'pl-10 pr-space-md')}
            type={type}
            name={name}
            autoComplete={autoComplete}
            placeholder={placeholder}
            defaultValue={defaultValue}
            required
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      )}
    </AuthField>
  );
}

/** Ô mật khẩu có nút hiện/ẩn; không giữ giá trị trong state (chỉ báo ra ngoài qua `onValueChange`). */
export function AuthPasswordField({
  name,
  label,
  autoComplete,
  hint,
  error,
  aux,
  onValueChange,
}: Omit<FieldProps, 'icon' | 'defaultValue' | 'placeholder'> & {
  onValueChange?: (value: string) => void;
}) {
  const t = useTranslations('auth.fields');
  const [visible, setVisible] = useState(false);
  return (
    <AuthField label={label} aux={aux} hint={hint} error={error}>
      {(a11y) => (
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-on-surface-variant">
            <Icon name="lock" size={18} />
          </span>
          <input
            {...a11y}
            className={cn(control, 'pl-10 pr-10')}
            type={visible ? 'text' : 'password'}
            name={name}
            autoComplete={autoComplete}
            onChange={onValueChange ? (e) => onValueChange(e.target.value) : undefined}
            required
            autoCapitalize="none"
            spellCheck={false}
          />
          <button
            type="button"
            className="absolute right-3 flex items-center justify-center text-on-surface-variant hover:text-on-surface"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? t('hidePassword') : t('showPassword')}
            aria-pressed={visible}
          >
            <Icon name={visible ? 'visibility_off' : 'visibility'} size={18} />
          </button>
        </div>
      )}
    </AuthField>
  );
}

/** Ô mã xác thực: bàn phím số + gợi ý điền mã một lần; `backup` cho mã dự phòng dạng chữ-số. */
export function AuthCodeField({
  name,
  label,
  hint,
  error,
  backup,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  backup?: boolean;
}) {
  return (
    <AuthField label={label} hint={hint} error={error}>
      {(a11y) => (
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-on-surface-variant">
            <Icon name="verified_user" size={18} />
          </span>
          <input
            {...a11y}
            className={cn(control, 'pl-10 pr-space-md', backup ? '' : 'tracking-[0.3em]')}
            name={name}
            type="text"
            inputMode={backup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={backup ? 16 : 10}
            required
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      )}
    </AuthField>
  );
}

/** Nút gửi form: khóa và hiện vòng xoay khi Server Action đang chạy (chống bấm đúp). */
export function AuthSubmit({ children, tone }: { children: ReactNode } & AuthButtonProps) {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.ui');
  return (
    <button
      type="submit"
      className={authButton({ tone })}
      disabled={pending}
      aria-busy={pending}
      title={pending ? t('pending') : undefined}
    >
      {pending ? <Icon name="progress_activity" size={18} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

const notice = cva(
  'flex items-start gap-space-sm rounded-lg p-space-sm font-body-sm text-body-sm',
  {
    variants: {
      tone: {
        success: 'bg-primary-fixed text-on-primary-fixed',
        info: 'bg-surface-container-low text-on-surface',
        warning: 'bg-tertiary-fixed text-on-tertiary-fixed',
        danger: 'bg-error-container text-on-error-container',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

const NOTICE_ICON: Record<NonNullable<VariantProps<typeof notice>['tone']>, IconName> = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  danger: 'error',
};

/** Thông báo trong khung xác thực: `danger` đọc ngay (role=alert), còn lại là trạng thái thường. */
export function AuthNotice({
  tone = 'info',
  children,
}: { children: ReactNode } & VariantProps<typeof notice>) {
  const key = tone ?? 'info';
  return (
    <div className={notice({ tone })} role={key === 'danger' ? 'alert' : 'status'}>
      <Icon name={NOTICE_ICON[key]} size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Ô/nút CHƯA có chức năng: hiện đúng thiết kế nhưng vô hiệu, kèm chú thích "Sắp có" (aria-disabled). */
export function SoonField({
  label,
  icon,
  soon,
  select,
  children,
}: {
  label: string;
  icon?: IconName;
  soon: string;
  /** Hiện như ô chọn (mũi tên) thay vì ô nhập. */
  select?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="font-label-md text-label-md text-on-surface" htmlFor={id}>
          {label}
        </label>
        <span className="font-label-sm text-label-sm text-outline">{soon}</span>
      </div>
      <div className="relative flex items-center">
        {icon ? (
          <span className="pointer-events-none absolute left-3 text-on-surface-variant">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        {select ? (
          <select
            id={id}
            disabled
            aria-disabled="true"
            title={soon}
            className={cn(control, 'px-space-md')}
          >
            {children}
          </select>
        ) : (
          <input
            id={id}
            disabled
            aria-disabled="true"
            title={soon}
            className={cn(control, icon ? 'pl-10 pr-space-md' : 'px-space-md')}
          />
        )}
      </div>
    </div>
  );
}
