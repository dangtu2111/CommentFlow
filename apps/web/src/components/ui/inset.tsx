import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Khối nền nhạt nằm TRONG một thẻ (Stitch `bg-surface-container-low`): tiêu đề nhỏ + biểu tượng tùy chọn + nội dung.
 * Dùng cho từng nhóm thiết lập (ngưỡng, khoảng trễ, từ khóa chặn, hành động quy tắc…) để trang không tự viết lại khối này.
 */
export function Inset({
  title,
  icon,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={['inset', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {title ? (
        <div className="inset-head">
          <span className="inset-title">{title}</span>
          {icon ? (
            <span className="inset-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
