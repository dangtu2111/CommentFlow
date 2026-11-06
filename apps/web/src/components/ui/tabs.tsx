import Link from 'next/link';

export type TabItem = { key: string; href: string; label: string; current: boolean };

const CLASSES = {
  /** Hai/ba tab nằm trong một thanh nền (Đăng nhập | Đăng ký). */
  segmented: { nav: 'tabs', item: 'tab' },
  /** Tab mục của trang cha (Bình luận ⟵ AI đã gửi). */
  section: { nav: 'section-tabs', item: 'section-tab' },
  /** Viên thuốc lọc theo nền tảng (Tất cả | Facebook | Instagram). */
  pill: { nav: 'pill-tabs', item: 'pill-tab' },
} as const;

/**
 * Thanh tab là các liên kết thật (đổi URL, không cần JS); tab hiện tại gắn `aria-current="page"`.
 * Không phải `role="tablist"`: tab ở đây điều hướng giữa các trang, nên dùng `<nav>` + liên kết.
 */
export function Tabs({
  items,
  label,
  variant = 'segmented',
}: {
  items: readonly TabItem[];
  label: string;
  variant?: keyof typeof CLASSES;
}) {
  const classes = CLASSES[variant];
  return (
    <nav className={classes.nav} aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={classes.item}
          aria-current={item.current ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
