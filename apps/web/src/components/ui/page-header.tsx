import type { ReactNode } from 'react';

/**
 * Đường dẫn "Cài đặt › Bảo mật": mục cuối là trang hiện tại. Một cấp cha dùng `root`, nhiều cấp dùng `parents`.
 * Dấu `›` chỉ để trang trí (ẩn với trình đọc màn hình).
 */
export function Breadcrumb({
  label,
  root,
  parents = [],
  current,
}: {
  label: string;
  root?: string;
  parents?: readonly string[];
  current: string;
}) {
  const trail = root ? [root, ...parents] : parents;
  return (
    <nav className="breadcrumb" aria-label={label}>
      {trail.map((name) => (
        <span key={name} className="breadcrumb-part">
          <span>{name}</span>
          <span aria-hidden="true">›</span>
        </span>
      ))}
      <span aria-current="page">{current}</span>
    </nav>
  );
}

/** Đầu trang: tiêu đề h1 + mô tả ngắn (tùy chọn). */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="stack-tight">
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </header>
  );
}
