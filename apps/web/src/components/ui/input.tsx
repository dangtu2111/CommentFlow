import { cva } from 'class-variance-authority';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const inputVariants = cva('input', {
  variants: {
    /** `toggle` chừa chỗ cho nút hiện/ẩn mật khẩu; `code` là ô mã số (2FA). */
    kind: { text: '', toggle: 'has-toggle', code: 'code-input' },
  },
  defaultVariants: { kind: 'text' },
});

/** Ô nhập của kit (class `input` trong form-field.css). Nhãn/lỗi do `FormField` lo. */
export function Input({
  kind,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { kind?: 'text' | 'toggle' | 'code' }) {
  return <input className={cn(inputVariants({ kind }), className)} {...rest} />;
}
