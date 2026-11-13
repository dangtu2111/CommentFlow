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

/** Mục có trong thiết kế nhưng chưa có trang/chức năng: hiện ở rail dạng vô hiệu ("Sắp có"), không phải liên kết. */
export type KbSoonItem = { key: 'kbDocs'; group: KbSubnavGroupKey };

export const KB_SUBNAV_GROUPS: ReadonlyArray<{ key: KbSubnavGroupKey; items: KbSubnavItem[] }> = [
  {
    key: 'structure',
    items: [
      { key: 'kbShop', href: '/app/kb/shop', group: 'structure' },
      { key: 'kbCatalog', href: '/app/kb/catalog', group: 'structure' },
      { key: 'productImport', href: '/app/products/import', group: 'structure' },
      { key: 'kbPolicies', href: '/app/kb/policies', group: 'structure' },
      { key: 'kbFaq', href: '/app/kb/faq', group: 'structure' },
      { key: 'kbGaps', href: '/app/kb-gaps', group: 'structure' },
    ],
  },
  {
    key: 'tuning',
    items: [
      { key: 'kbVoice', href: '/app/kb/voice', group: 'tuning' },
      { key: 'kbRules', href: '/app/kb/rules', group: 'tuning' },
      { key: 'kbDictionary', href: '/app/kb/abbreviations', group: 'tuning' },
      { key: 'readiness', href: '/app/readiness', group: 'tuning' },
      { key: 'tryAi', href: '/app/try-ai', group: 'tuning' },
      { key: 'kbPublish', href: '/app/kb-publish', group: 'tuning' },
    ],
  },
];

/** Mục "Sắp có" của thiết kế, chèn vào rail đúng nhóm (Tài liệu). */
export const KB_SOON_ITEMS: readonly KbSoonItem[] = [{ key: 'kbDocs', group: 'structure' }];

export function kbSubnavFor(): KbSubnavItem[] {
  return KB_SUBNAV_GROUPS.flatMap((group) => group.items);
}
