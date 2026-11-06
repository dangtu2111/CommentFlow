import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Thành phần biểu mẫu/thông báo cho trang dựng bằng Tailwind (Tự động hóa, Quy tắc spam): công tắc, ô nhập,
 * dải thông báo. Class chép từ HTML Stitch; chỉ chạy bên trong phần tử bọc `.tw`. File MỚI (không sửa kit cũ).
 */

/** Công tắc bật/tắt (Stitch: `peer` + thanh trượt). `label` là tên đọc cho trình đọc màn hình. */
export function Toggle({
  label,
  name,
  value,
  defaultChecked,
  disabled,
  className,
}: {
  label: string;
  name?: string;
  value?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'relative inline-flex shrink-0 items-center',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-disabled={disabled ? 'true' : undefined}
        aria-label={label}
        className="peer sr-only"
      />
      <div className="peer h-6 w-11 rounded-full bg-surface-container-highest after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-container peer-checked:after:translate-x-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary" />
    </label>
  );
}

/** Lớp ô nhập/select/textarea dùng chung (nền xám nhạt như thiết kế, viền khi lấy nét). */
export const FIELD_CLASS =
  'w-full rounded-lg bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface shadow-sm outline-none ring-1 ring-outline-variant placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary-container disabled:cursor-not-allowed disabled:opacity-70';

const notice = cva('rounded-xl p-space-md font-body-md text-body-md', {
  variants: {
    tone: {
      info: 'bg-primary-fixed text-on-primary-fixed',
      warning: 'bg-tertiary-fixed text-on-tertiary-fixed',
      success: 'bg-secondary-fixed text-on-secondary-fixed',
      danger: 'bg-error-container text-on-error-container',
    },
  },
  defaultVariants: { tone: 'info' },
});

/** Dải thông báo (thay `Banner` cũ). `danger` là `role="alert"`, còn lại là `role="status"`. */
export function Notice({ tone, children }: VariantProps<typeof notice> & { children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={notice({ tone })}>
      {children}
    </div>
  );
}
