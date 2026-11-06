'use client';

import { Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { FormField } from './form-field';

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

/** Ô nhập văn bản/email có biểu tượng; lỗi gắn bằng aria-invalid + aria-describedby. */
export function TextField({
  type = 'text',
  icon,
  ...props
}: FieldProps & { type?: 'text' | 'email' }) {
  const id = useId();
  const Icon = ICONS[icon];
  return (
    <FormField id={id} label={props.label} aux={props.aux} hint={props.hint} error={props.error}>
      {(control) => (
        <div className="input-wrap">
          <Icon className="input-icon" size={18} aria-hidden="true" />
          <input
            {...control}
            className="input"
            type={type}
            name={props.name}
            autoComplete={props.autoComplete}
            placeholder={props.placeholder}
            defaultValue={props.defaultValue}
            required
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      )}
    </FormField>
  );
}

/** Ô mật khẩu có nút hiện/ẩn (không lưu giá trị vào state ngoài ô). */
export function PasswordField(
  props: Omit<FieldProps, 'icon' | 'defaultValue' | 'placeholder'> & {
    /** Báo giá trị đang gõ cho thẻ cha (thanh độ mạnh); ô vẫn không điều khiển. */
    onValueChange?: (value: string) => void;
  },
) {
  const id = useId();
  const t = useTranslations('auth.fields');
  const [visible, setVisible] = useState(false);
  return (
    <FormField id={id} label={props.label} aux={props.aux} hint={props.hint} error={props.error}>
      {(control) => (
        <div className="input-wrap">
          <Lock className="input-icon" size={18} aria-hidden="true" />
          <input
            {...control}
            className="input has-toggle"
            type={visible ? 'text' : 'password'}
            name={props.name}
            autoComplete={props.autoComplete}
            onChange={
              props.onValueChange ? (e) => props.onValueChange?.(e.target.value) : undefined
            }
            required
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
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </FormField>
  );
}

/** Ô nhập mã xác thực: bàn phím số, gợi ý điền mã một lần của hệ điều hành; `backup` cho mã dự phòng dạng chữ-số. */
export function CodeField(props: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  variant?: 'totp' | 'backup';
}) {
  const id = useId();
  const backup = props.variant === 'backup';
  return (
    <FormField id={id} label={props.label} hint={props.hint} error={props.error}>
      {(control) => (
        <div className="input-wrap">
          <ShieldCheck className="input-icon" size={18} aria-hidden="true" />
          <input
            {...control}
            className="input code-input"
            name={props.name}
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
    </FormField>
  );
}
