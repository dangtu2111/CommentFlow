'use client';

import { CircleAlert, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';

const ICONS = { mail: Mail, user: User, lock: Lock };

type FieldProps = {
  name: string;
  label: string;
  icon: keyof typeof ICONS;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  /** Liên kết phụ cùng hàng với nhãn (ví dụ "Quên mật khẩu?"). */
  aux?: ReactNode;
};

function FieldShell({
  id,
  label,
  aux,
  hint,
  error,
  children,
}: Pick<FieldProps, 'label' | 'aux' | 'hint' | 'error'> & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {aux ? <span className="field-aux">{aux}</span> : null}
      </div>
      {children}
      {hint && !error ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

/** Ô nhập văn bản/email có biểu tượng; lỗi gắn bằng aria-invalid + aria-describedby. */
export function TextField({
  type = 'text',
  icon,
  ...props
}: FieldProps & { type?: 'text' | 'email' }) {
  const id = useId();
  const Icon = ICONS[icon];
  return (
    <FieldShell id={id} label={props.label} aux={props.aux} hint={props.hint} error={props.error}>
      <div className="input-wrap">
        <Icon className="input-icon" size={18} aria-hidden="true" />
        <input
          id={id}
          className="input"
          type={type}
          name={props.name}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          defaultValue={props.defaultValue}
          required
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(id, props.hint, props.error)}
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
    </FieldShell>
  );
}

/** Ô mật khẩu có nút hiện/ẩn (không lưu giá trị vào state ngoài ô). */
export function PasswordField(props: Omit<FieldProps, 'icon' | 'defaultValue' | 'placeholder'>) {
  const id = useId();
  const t = useTranslations('auth.fields');
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={props.label} aux={props.aux} hint={props.hint} error={props.error}>
      <div className="input-wrap">
        <Lock className="input-icon" size={18} aria-hidden="true" />
        <input
          id={id}
          className="input has-toggle"
          type={visible ? 'text' : 'password'}
          name={props.name}
          autoComplete={props.autoComplete}
          required
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(id, props.hint, props.error)}
          autoCapitalize="none"
          spellCheck={false}
        />
        <button
          type="button"
          className="input-toggle"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  );
}
