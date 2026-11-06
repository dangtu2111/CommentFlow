import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

/** Viên nhãn nhỏ của Stitch (Cơ sở kiến thức, Bài viết). Màu theo `tone`; chỉ dùng bên trong `.tw`. */
const pillVariants = cva('inline-flex items-center gap-1 font-label-sm text-label-sm', {
  variants: {
    tone: {
      primary: 'bg-primary-container text-on-primary',
      muted: 'bg-surface-container-high text-on-surface-variant',
      surface: 'bg-surface-container-high text-on-surface',
      accent: 'bg-secondary-fixed text-on-secondary-fixed',
      danger: 'bg-error-container text-on-error-container',
      warn: 'bg-tertiary-container text-on-tertiary-container',
      outlineSecondary: 'bg-secondary/15 text-secondary',
      softPrimary: 'bg-primary-container/15 text-primary-container',
      softError: 'bg-error/10 text-error font-bold',
    },
    shape: { full: 'rounded-full px-2 py-0.5', box: 'rounded px-2 py-0.5' },
  },
  defaultVariants: { tone: 'muted', shape: 'full' },
});

export type PillProps = VariantProps<typeof pillVariants> & {
  className?: string;
  children: ReactNode;
};

/**
 * Không dùng `cn()`/tailwind-merge: nó coi `text-label-sm` (cỡ chữ của Stitch) là MÀU chữ rồi bỏ đi khi gặp
 * `text-on-primary`, làm nhãn to bằng chữ thường. Ghép chuỗi thẳng; `className` chỉ để thêm, không để ghi đè.
 */
export function Pill({ tone, shape, className, children }: PillProps) {
  const classes = className
    ? `${pillVariants({ tone, shape })} ${className}`
    : pillVariants({ tone, shape });
  return <span className={classes}>{children}</span>;
}
