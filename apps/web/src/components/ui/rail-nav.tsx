import Link from 'next/link';
import type { ReactNode } from 'react';

export type RailItem = {
  key: string;
  href: string;
  label: string;
  current: boolean;
  /** Ghi chú ngắn bên phải (số đếm thật); bỏ trống nếu chưa có dữ liệu. */
  count?: ReactNode;
};

export type RailGroup = { key: string; title: string; items: readonly RailItem[] };

function RailLink({ item }: { item: RailItem }) {
  return (
    <Link href={item.href} className="rail-link" aria-current={item.current ? 'page' : undefined}>
      <span>{item.label}</span>
      {item.count ? <span className="rail-count">{item.count}</span> : null}
    </Link>
  );
}

/**
 * Cột điều hướng con dạng "rail" (Cơ sở kiến thức): mục đầu tùy chọn (`lead`) rồi các nhóm có tiêu đề.
 * Liên kết thật, mục hiện tại gắn `aria-current="page"`. Dưới 800px thành hàng cuộn ngang phía trên.
 */
export function RailNav({
  label,
  lead,
  groups,
}: {
  label: string;
  lead?: RailItem;
  groups: readonly RailGroup[];
}) {
  return (
    <nav className="rail" aria-label={label}>
      {lead ? <RailLink item={lead} /> : null}
      {groups.map((group) => (
        <div key={group.key} className="rail-group">
          <p className="rail-heading">{group.title}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.key}>
                <RailLink item={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
