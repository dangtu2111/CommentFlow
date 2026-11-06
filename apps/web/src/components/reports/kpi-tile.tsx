import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/icon';

const labelTone = cva('font-label-sm text-label-sm uppercase tracking-wider', {
  variants: {
    tone: {
      neutral: 'text-on-surface-variant',
      secondary: 'text-secondary',
      tertiary: 'text-tertiary',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

const valueTone = cva('font-headline-lg text-headline-lg font-bold tracking-tight', {
  variants: {
    tone: { neutral: 'text-on-surface', secondary: 'text-secondary', tertiary: 'text-tertiary' },
  },
  defaultVariants: { tone: 'neutral' },
});

const iconTone = cva('rounded-lg p-1.5', {
  variants: {
    tone: {
      neutral: 'bg-surface-container text-primary',
      secondary: 'bg-secondary-fixed text-on-secondary-fixed',
      tertiary: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** Thẻ chỉ số của Báo cáo (design/stitch/reports.html §2): nhãn + biểu tượng, số lớn, dòng phụ, chân. */
export function KpiTile({
  tone,
  label,
  icon,
  value,
  detail,
  footer,
}: {
  tone?: 'neutral' | 'secondary' | 'tertiary';
  label: string;
  icon: IconName;
  value: ReactNode;
  detail: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-space-lg shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <span className={labelTone({ tone })}>{label}</span>
        <span className={iconTone({ tone })}>
          <Icon name={icon} size={14} />
        </span>
      </div>
      <div className="my-space-sm">
        <div className={valueTone({ tone })}>{value}</div>
        <div className="mt-1 flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
          {detail}
        </div>
      </div>
      {footer}
    </div>
  );
}
