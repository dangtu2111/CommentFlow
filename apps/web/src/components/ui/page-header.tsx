import type { ReactNode } from 'react';

/** Đường dẫn "Cài đặt › Bảo mật": mục cuối là trang hiện tại. `separator` chỉ để trang trí (ẩn với trình đọc màn hình). */
export function Breadcrumb({
  label,
  root,
  current,
}: {
  label: string;
  root: string;
  current: string;
}) {
  return (
    <nav className="breadcrumb" aria-label={label}>
      <span>{root}</span>
      <span aria-hidden="true">›</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

/** Đầu trang: tiêu đề h1 + mô tả ngắn (tùy chọn). */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </>
  );
}
