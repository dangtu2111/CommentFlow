import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type Variant = 'info' | 'success' | 'warning' | 'danger';

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

/** Thông báo dạng dải (docs/08 §5 `Banner`). Lỗi dùng role="alert", còn lại role="status". */
export function Banner({ variant = 'info', children }: { variant?: Variant; children: ReactNode }) {
  const Icon = ICONS[variant];
  return (
    <div className={`banner banner-${variant}`} role={variant === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
