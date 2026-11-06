import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

const chipVariants = cva('chip', {
  variants: {
    tone: {
      success: 'chip-success',
      info: 'chip-info',
      muted: 'chip-muted',
      warning: 'chip-warning',
      solid: 'chip-solid',
      accent: 'chip-accent',
      warm: 'chip-warm',
      danger: 'chip-danger',
      locked: 'chip-locked',
    },
  },
  defaultVariants: { tone: 'muted' },
});

/**
 * `solid` = nền nút chính (Tự động, Đang bật); `accent` = tím AI nhạt; `warm` = cam nhạt (Chạy thử, Cần kiểm tra);
 * `danger` = đỏ nhạt (từ khóa chặn); `locked` = xám có khóa (Không hỗ trợ).
 */
export type ChipTone =
  | 'success'
  | 'info'
  | 'muted'
  | 'warning'
  | 'solid'
  | 'accent'
  | 'warm'
  | 'danger'
  | 'locked';

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
  return <span className={cn(chipVariants({ tone }), className)}>{children}</span>;
}
