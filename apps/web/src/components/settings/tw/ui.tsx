import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

/**
 * Thành phần Tailwind riêng của khu Cài đặt (Q-TWS1). Class chép từ `design/stitch/settings-*.html`;
 * chỉ dùng BÊN TRONG phần tử bọc `.tw` (ADR 013). Dùng lại ở bảo mật, thành viên, gói cước và các hộp thoại.
 */

/** Nút theo Stitch: `primary` (xanh đậm), `soft` (nền xám nhạt), `plain` (trắng), `danger`, `danger-ghost`, `danger-soft`. */
export const twBtn = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-title-sm text-title-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:cursor-not-allowed',
  {
    variants: {
      tone: {
        primary: 'bg-primary-container text-on-primary hover:bg-primary shadow-sm',
        soft: 'bg-surface-container text-on-surface hover:bg-surface-container-high',
        plain: 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-high',
        secondary: 'bg-secondary text-on-secondary hover:bg-secondary-container shadow-sm',
        danger: 'bg-error text-on-error hover:bg-on-error-container',
        'danger-ghost': 'text-error hover:bg-error-container/40',
        'danger-soft': 'bg-error-container text-on-error-container hover:bg-error/20',
        link: 'text-primary hover:bg-surface-container',
      },
      size: { sm: 'px-3 py-1.5', md: 'px-3.5 py-2', lg: 'px-4 py-2' },
    },
    defaultVariants: { tone: 'soft', size: 'md' },
  },
);
export type TwBtnProps = VariantProps<typeof twBtn>;

/** Thẻ trắng bo `xl` của Stitch (`bg-surface-container-lowest rounded-xl shadow-sm`). */
export function TwCard({
  children,
  className,
  labelledBy,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  as?: 'section' | 'div';
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cn(
        'bg-surface-container-lowest rounded-xl shadow-sm p-space-xl space-y-space-lg',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

const CHIP_TONES = {
  ok: 'bg-[#EBF7ED] text-[#237A36]',
  info: 'bg-secondary-fixed text-on-secondary-fixed',
  muted: 'bg-surface-container text-on-surface-variant',
  neutral: 'bg-surface-container-high text-on-surface',
  primary: 'bg-primary-container text-on-primary',
  warn: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  error: 'bg-error-container text-on-error-container',
} as const;
export type TwChipTone = keyof typeof CHIP_TONES;

/** Chip tròn nhỏ (`rounded-full px-2 py-0.5 font-label-sm`). */
export function TwChip({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: TwChipTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-label-sm text-label-sm',
        CHIP_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Đầu thẻ: biểu tượng (trần 24px hoặc ô `hero` 48px) + tiêu đề + mô tả + khe bên phải. */
export function TwCardHead({
  id,
  icon,
  title,
  description,
  end,
  hero = false,
}: {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  end?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div className="flex items-start gap-space-md md:items-center">
        {hero ? (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container to-secondary flex items-center justify-center text-on-primary shadow-sm shrink-0">
            {icon}
          </div>
        ) : (
          <span className="text-primary shrink-0">{icon}</span>
        )}
        <div>
          <h2
            id={id}
            className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-space-sm flex-wrap"
          >
            {title}
          </h2>
          {description ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {end ? <div className="flex items-center gap-2 flex-wrap">{end}</div> : null}
    </div>
  );
}

/** Nút chưa có chức năng: hiện đúng thiết kế, vô hiệu + chú thích "Sắp có" (aria-disabled, không bấm được). */
export function TwSoonButton({
  tone,
  size,
  soon,
  children,
}: TwBtnProps & { soon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      title={soon}
      tabIndex={-1}
      className={twBtn({ tone, size })}
    >
      {children}
      <span className="font-label-sm text-label-sm opacity-80">· {soon}</span>
    </button>
  );
}
