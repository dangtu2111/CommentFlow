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

/**
 * Đầu trang: tiêu đề h1 + mô tả ngắn (tùy chọn). Có thể thêm ô biểu tượng (`icon`), huy hiệu cạnh tiêu đề
 * (`badge`) và cụm nút/trạng thái bên phải (`actions`); không thêm gì thì giữ bố cục cũ.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  badge,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  const text = (
    <>
      {badge ? (
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
      ) : (
        <h1 className="page-title">{title}</h1>
      )}
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </>
  );
  if (!icon && !actions) return <header className="stack-tight">{text}</header>;
  return (
    <header className="page-header-rich">
      <div className="page-header-main">
        {icon ? (
          <span className="page-header-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="stack-tight">{text}</div>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
