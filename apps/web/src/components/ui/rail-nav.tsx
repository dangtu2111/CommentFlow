import { cva } from 'class-variance-authority';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export type RailItem = {
  key: string;
  href: string;
  label: string;
  current: boolean;
  /** Biểu tượng Material (bảng `icon-paths.ts`) đứng trước nhãn. */
  icon?: IconName;
  /** Ghi chú ngắn bên phải (số đếm thật); bỏ trống nếu chưa có dữ liệu. */
  count?: ReactNode;
  /** Chức năng chưa có: hiện đúng thiết kế nhưng không bấm được (`aria-disabled`). */
  disabled?: boolean;
};

export type RailGroup = { key: string; title: string; items: readonly RailItem[] };

const railLink = cva(
  'flex items-center justify-between rounded-lg px-3 py-2 font-title-sm text-title-sm transition-colors',
  {
    variants: {
      state: {
        current: 'bg-primary-container text-on-primary shadow-sm',
        idle: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
        disabled: 'cursor-not-allowed text-on-surface-variant opacity-60',
      },
    },
  },
);

function RailLink({ item }: { item: RailItem }) {
  const state = item.disabled ? 'disabled' : item.current ? 'current' : 'idle';
  const inner = (
    <>
      <span className="flex items-center gap-2">
        {item.icon ? <Icon name={item.icon} size={16} /> : null}
        <span>{item.label}</span>
      </span>
      {item.count ? (
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface">
          {item.count}
        </span>
      ) : null}
    </>
  );
  if (item.disabled) {
    return (
      <span className={railLink({ state })} aria-disabled="true">
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={railLink({ state })}
      aria-current={item.current ? 'page' : undefined}
    >
      {inner}
    </Link>
  );
}

const headingClass =
  'mb-space-xs px-space-sm font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant';

/**
 * Cột điều hướng con dạng "rail" (Cơ sở kiến thức, `design/stitch/knowledge-base.html`): mục đầu tùy chọn (`lead`)
 * rồi các nhóm có tiêu đề, ngăn bằng đường mảnh. Liên kết thật, mục hiện tại gắn `aria-current="page"`.
 * Chỉ dùng bên trong phần tử bọc `.tw`.
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
    <nav className="w-full shrink-0 space-y-1 lg:w-56" aria-label={label}>
      {lead ? <RailLink item={lead} /> : null}
      {groups.map((group, index) => (
        <div key={group.key} className="space-y-1">
          {index > 0 ? (
            <div className="py-2">
              <div className="h-px bg-surface-container-highest" />
            </div>
          ) : null}
          <p className={headingClass}>{group.title}</p>
          <ul className="space-y-1">
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
