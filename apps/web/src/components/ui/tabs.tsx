import Link from 'next/link';
import type { ReactNode } from 'react';

export type TabItem = {
  key: string;
  href: string;
  label: string;
  current: boolean;
  /** Biểu tượng đứng trước nhãn (biến thể `toolbar`). */
  icon?: ReactNode;
  /** Số đếm/huy hiệu đứng sau nhãn. */
  badge?: ReactNode;
  /** Chức năng chưa có: hiện đúng thiết kế nhưng không bấm được (`aria-disabled`). */
  disabled?: boolean;
};

const CLASSES = {
  /** Hai/ba tab nằm trong một thanh nền (Đăng nhập | Đăng ký). */
  segmented: { nav: 'tabs', item: 'tab' },
  /** Tab mục của trang cha (Bình luận ⟵ AI đã gửi). */
  section: { nav: 'section-tabs', item: 'section-tab' },
  /** Viên thuốc lọc theo nền tảng (Tất cả | Facebook | Instagram). */
  pill: { nav: 'pill-tabs', item: 'pill-tab' },
  /** Thanh công cụ nền nhạt, tab có biểu tượng + huy hiệu (Tự động hóa, Quy tắc spam). */
  toolbar: { nav: 'toolbar-tabs', item: 'toolbar-tab' },
} as const;

/**
 * Thanh tab là các liên kết thật (đổi URL, không cần JS); tab hiện tại gắn `aria-current="page"`.
 * Không phải `role="tablist"`: tab ở đây điều hướng giữa các trang, nên dùng `<nav>` + liên kết.
 * Tab `disabled` là `<span aria-disabled>` (không điều hướng), kèm `disabledNote` ("Sắp có") cho trình đọc màn hình.
 */
export function Tabs({
  items,
  label,
  variant = 'segmented',
  disabledNote,
}: {
  items: readonly TabItem[];
  label: string;
  variant?: keyof typeof CLASSES;
  disabledNote?: string;
}) {
  const classes = CLASSES[variant];
  return (
    <nav className={classes.nav} aria-label={label}>
      {items.map((item) => {
        const inner = (
          <>
            {item.icon ? (
              <span className="tab-icon" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
            {item.badge ? <span className="tab-badge">{item.badge}</span> : null}
          </>
        );
        if (item.disabled) {
          return (
            <span key={item.key} className={classes.item} aria-disabled="true" title={disabledNote}>
              {inner}
              {disabledNote ? <span className="visually-hidden">{disabledNote}</span> : null}
            </span>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            className={classes.item}
            aria-current={item.current ? 'page' : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
