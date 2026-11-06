import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Mảnh dựng lại dùng chung cho Khách tiềm năng, Báo cáo, Nhật ký (class Tailwind chép từ HTML Stitch; chỉ chạy
 * bên trong phần tử bọc `.tw`). Khối lặp ≥ 2 nơi: thẻ nền trắng, huy hiệu/viên thuốc, nút "Sắp có".
 */

/** Khung nội dung của trang dựng bằng Tailwind: `.tw` bọc ngoài, lề 16px, trần 1720px canh giữa (như HTML Stitch). */
export function TwPage({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return (
    <main className="tw w-full">
      <div
        className={cn('mx-auto w-full max-w-[1720px] space-y-space-lg', flush ? '' : 'p-space-lg')}
      >
        {children}
      </div>
    </main>
  );
}

const panel = cva('rounded-xl bg-surface-container-lowest shadow-sm', {
  variants: { size: { none: '', sm: 'p-space-sm', md: 'p-space-md', lg: 'p-space-lg' } },
  defaultVariants: { size: 'md' },
});

/** Thẻ nền trắng bo `xl`, bóng nhẹ. */
export function Panel({
  size,
  className,
  children,
  ...rest
}: VariantProps<typeof panel> & { className?: string; children: ReactNode; id?: string }) {
  return (
    <div className={cn(panel({ size }), className)} {...rest}>
      {children}
    </div>
  );
}

const badge = cva('inline-flex items-center gap-1 font-label-sm text-label-sm', {
  variants: {
    variant: { full: 'rounded-full px-2 py-0.5', box: 'rounded px-1.5 py-0.5' },
    tone: {
      primary: 'bg-primary-container text-on-primary',
      secondary: 'bg-secondary-fixed text-on-secondary-fixed',
      tertiary: 'bg-tertiary-fixed text-on-tertiary-fixed',
      error: 'bg-error-container text-on-error-container',
      neutral: 'bg-surface-container text-on-surface-variant',
      strong: 'bg-surface-container-high text-on-surface',
      low: 'bg-surface-container-low text-primary',
    },
  },
  defaultVariants: { variant: 'full', tone: 'neutral' },
});

/** Huy hiệu/viên thuốc nhỏ (nhãn trạng thái, số đếm). */
export function Badge({
  variant,
  tone,
  className,
  children,
}: VariantProps<typeof badge> & { className?: string; children: ReactNode }) {
  return <span className={cn(badge({ variant, tone }), className)}>{children}</span>;
}

const soonButton = cva(
  'inline-flex cursor-not-allowed items-center justify-center gap-1.5 opacity-70 transition-colors',
  {
    variants: {
      variant: {
        primary:
          'rounded-lg bg-primary-container px-4 py-2 font-title-sm text-title-sm text-on-primary shadow-md',
        neutral:
          'rounded-lg bg-surface-container px-3.5 py-2 font-title-sm text-title-sm text-on-surface shadow-sm',
        soft: 'rounded-lg bg-surface-container-low px-3 py-1.5 font-title-sm text-title-sm text-on-surface',
        mini: 'rounded bg-surface-container px-2.5 py-1 font-label-sm text-label-sm text-on-surface',
        link: 'font-label-sm text-label-sm font-semibold text-primary',
        icon: 'rounded-lg p-2 text-on-surface-variant',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

/**
 * Nút/ô điều khiển CHƯA có chức năng: hiển thị đúng thiết kế nhưng vô hiệu (`aria-disabled`) kèm chú thích "Sắp có"
 * (QUY TẮC ĐỦ THÀNH PHẦN). `soon` là chuỗi đã dịch.
 */
export function SoonButton({
  variant,
  soon,
  label,
  className,
  children,
}: VariantProps<typeof soonButton> & {
  soon: string;
  /** Nhãn đọc cho nút chỉ có biểu tượng. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={label}
      title={soon}
      tabIndex={-1}
      className={cn(soonButton({ variant }), className)}
    >
      {children}
    </button>
  );
}

/** Thanh tiến độ mảnh (tỷ lệ 0–100). */
export function Meter({
  pct,
  tone = 'primary',
  className,
}: {
  pct: number;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'error' | 'outline';
  className?: string;
}) {
  const fill = {
    primary: 'bg-primary-container',
    secondary: 'bg-secondary',
    tertiary: 'bg-tertiary-container',
    error: 'bg-error',
    outline: 'bg-outline',
  }[tone];
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-container', className)}
    >
      <div
        className={cn('h-full rounded-full', fill)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
