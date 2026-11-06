import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { labelTone } from '../../lib/inbox-visual';
import { Icon, type IconName } from '../ui/icon';

const chip = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm',
  {
    variants: {
      tone: {
        price: 'bg-primary-fixed font-semibold text-on-primary-fixed-variant',
        advice: 'bg-surface-container-high font-medium text-on-surface',
        purchase: 'bg-secondary-fixed font-bold text-on-secondary-fixed',
        complaint: 'bg-error-container font-bold text-on-error-container',
        spam: 'bg-surface-container font-medium text-on-surface-variant',
        neutral: 'bg-surface-container font-medium text-on-surface-variant',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

type Tone = NonNullable<VariantProps<typeof chip>['tone']>;

/** Chấm/biểu tượng đầu chip theo HTML Stitch: Hỏi giá/Tư vấn = chấm; Mua hàng = dấu !; Khiếu nại = cảnh báo. */
const LEAD: Record<Tone, { icon: IconName; className: string } | { dot: string } | null> = {
  price: { dot: 'bg-primary-container' },
  advice: { dot: 'bg-primary' },
  purchase: { icon: 'priority_high', className: 'text-secondary' },
  complaint: { icon: 'warning', className: '' },
  spam: null,
  neutral: null,
};

/** Chip nhãn ý định (Hỏi giá, Tư vấn, Mua hàng…). Dùng ở danh sách, chi tiết và chú giải cột lọc. */
export function LabelChip({
  label,
  children,
  lead = true,
}: {
  label: string | null;
  children: ReactNode;
  /** `false` khi chip chỉ là chú giải (không chấm/biểu tượng). */
  lead?: boolean;
}) {
  const tone = labelTone(label);
  const mark = lead ? LEAD[tone] : null;
  return (
    <span className={chip({ tone })}>
      {mark && 'dot' in mark ? (
        <span className={`h-1.5 w-1.5 rounded-full ${mark.dot}`} aria-hidden="true" />
      ) : null}
      {mark && 'icon' in mark ? (
        <span className={mark.className}>
          <Icon name={mark.icon} size={12} />
        </span>
      ) : null}
      {children}
    </span>
  );
}

const status = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-container text-on-surface-variant',
        success: 'bg-primary-fixed text-on-primary-fixed-variant',
        ai: 'bg-secondary-fixed text-on-secondary-fixed',
        warn: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
        danger: 'bg-error-container text-on-error-container',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

type StatusTone = NonNullable<VariantProps<typeof status>['tone']>;

const STATUS_TONE: Record<string, StatusTone> = {
  replied: 'success',
  auto_replied: 'success',
  scheduled_auto: 'ai',
  sending: 'ai',
  processing: 'ai',
  needs_human: 'warn',
  send_failed: 'danger',
  spam_suspected: 'danger',
};

/** Chip trạng thái xử lý của bình luận; trạng thái lạ → trung tính. */
export function StatusChip({
  status: value,
  className,
  children,
}: {
  status: string;
  className?: string;
  children: ReactNode;
}) {
  const tone = STATUS_TONE[value] ?? 'neutral';
  return <span className={`${status({ tone })} ${className ?? ''}`.trim()}>{children}</span>;
}
