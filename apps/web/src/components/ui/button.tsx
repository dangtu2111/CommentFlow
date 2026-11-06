import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'danger-ghost';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  danger: 'btn btn-danger',
  ghost: 'btn btn-ghost',
  'danger-ghost': 'btn btn-danger-ghost',
};

/** Chuỗi class của nút — dùng cho liên kết trông như nút (`<Link className={buttonClass({ variant: 'primary' })}>`). */
export function buttonClass({
  variant = 'primary',
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
} = {}): string {
  return [VARIANT_CLASS[variant], block ? 'btn-block' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
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
