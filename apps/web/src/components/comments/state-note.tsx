import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

const note = cva('rounded-lg p-3.5 font-body-md text-body-md [&_p+p]:mt-1', {
  variants: {
    tone: {
      progress: 'bg-surface-container-low text-on-surface',
      success: 'bg-primary-fixed/40 text-on-primary-fixed-variant',
      danger: 'bg-error-container text-on-error-container',
      muted: 'bg-surface-container text-on-surface-variant',
    },
  },
  defaultVariants: { tone: 'muted' },
});

/**
 * Khung thông báo trạng thái trong cột chi tiết (đang gửi, đã gửi, lỗi, bị chặn…).
 * `role` do nơi gọi chọn (status/alert) để trình đọc màn hình đọc đúng mức.
 */
export function StateNote({
  tone,
  role,
  title,
  children,
}: VariantProps<typeof note> & {
  role: 'status' | 'alert';
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={note({ tone })} role={role}>
      {title ? <p className="font-title-sm text-title-sm">{title}</p> : null}
      {children}
    </div>
  );
}

/** Trích nội dung câu trả lời (người dùng đã gửi / đang gửi). */
export function QuoteBlock({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-container-lowest p-3 font-body-lg text-body-lg text-on-surface">
      {children}
    </blockquote>
  );
}

/** Thông báo lỗi nhỏ dưới ô nhập/nút. */
export function InlineError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="font-label-md text-label-md text-error">
      {children}
    </p>
  );
}
