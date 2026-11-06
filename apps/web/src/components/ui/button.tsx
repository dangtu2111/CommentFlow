import { cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'danger-ghost';

// Biến thể khai báo bằng cva; class vẫn là lớp của kit (button.css) để trang cũ ngoài `.tw` không đổi.
// Khi trang được port sang Tailwind, thay chuỗi class dưới đây bằng class tiện ích — props công khai giữ nguyên.
const buttonVariants = cva('btn', {
  variants: {
    variant: {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      danger: 'btn-danger',
      ghost: 'btn-ghost',
      'danger-ghost': 'btn-danger-ghost',
    },
    block: { true: 'btn-block', false: '' },
  },
  defaultVariants: { variant: 'primary', block: false },
});

/** Chuỗi class của nút — dùng cho liên kết trông như nút (`<Link className={buttonClass({ variant: 'primary' })}>`). */
export function buttonClass({
  variant,
  block,
  className,
}: {
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
} = {}): string {
  return cn(buttonVariants({ variant, block }), className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  block?: boolean;
};

/** Nút hành động. `type` mặc định `button` để không vô tình gửi form. */
export function Button({ variant, block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, block, className })} {...rest} />;
}

/** Nút chỉ có biểu tượng; bắt buộc có `label` (đọc cho trình đọc màn hình). */
export function IconButton({
  label,
  className,
  type = 'button',
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { label: string }) {
  return (
    <button
      type={type}
      className={['icon-button', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  );
}
