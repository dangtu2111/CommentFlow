import type { ReactNode } from 'react';

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
  return (
    <span className={['chip', `chip-${tone}`, className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
