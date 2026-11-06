import type { NavItemKey } from './app-nav';

/**
 * Menu "Cấu trúc tri thức" / "Tinh chỉnh" của trang Cơ sở kiến thức (design/stitch/knowledge-base.png).
 * Chỉ trỏ tới trang ĐÃ TỒN TẠI (cùng nguồn với `app-nav.ts`); mục thiết kế có mà chưa có trang (Thông tin cửa hàng,
 * Chính sách, Tài liệu, Giọng văn, Từ điển viết tắt…) không hiện cho tới khi tính năng ra đời.
 */
/** Trang tổng quan KB: mục đầu của rail (không thuộc nhóm nào). */
export const KB_HOME: { key: NavItemKey; href: string } = { key: 'kb', href: '/app/kb' };

export type KbSubnavGroupKey = 'structure' | 'tuning';
export type KbSubnavItem = { key: NavItemKey; href: string; group: KbSubnavGroupKey };

export const KB_SUBNAV_GROUPS: ReadonlyArray<{ key: KbSubnavGroupKey; items: KbSubnavItem[] }> = [
  {
    key: 'structure',
    items: [
      { key: 'productImport', href: '/app/products/import', group: 'structure' },
      { key: 'kbGaps', href: '/app/kb-gaps', group: 'structure' },
    ],
  },
  {
    key: 'tuning',
    items: [
      { key: 'readiness', href: '/app/readiness', group: 'tuning' },
      { key: 'tryAi', href: '/app/try-ai', group: 'tuning' },
      { key: 'kbTestset', href: '/app/kb-testset', group: 'tuning' },
      { key: 'kbPublish', href: '/app/kb-publish', group: 'tuning' },
    ],
  },
];

export function kbSubnavFor(): KbSubnavItem[] {
  return KB_SUBNAV_GROUPS.flatMap((group) => group.items);
}
