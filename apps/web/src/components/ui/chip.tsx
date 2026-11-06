import type { ReactNode } from 'react';

export type ChipTone = 'success' | 'info' | 'muted' | 'warning';

/** Nhãn nhỏ dạng viên thuốc (trạng thái, vai trò, huy hiệu). Màu theo `tone`, không phụ thuộc màu thương hiệu. */
export function Chip({
  tone = 'muted',
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={['chip', `chip-${tone}`, className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
