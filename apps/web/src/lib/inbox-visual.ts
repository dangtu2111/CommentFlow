import type { InboxTabKey } from './inbox-filters';

/** Chữ viết tắt trên huy hiệu nền tảng ở ảnh đại diện (không dùng logo thương hiệu). */
export function platformBadgeText(platform: string): string {
  if (platform === 'facebook') return 'FB';
  if (platform === 'instagram') return 'IG';
  if (platform === 'tiktok') return 'TT';
  const head = Array.from(platform.trim()).slice(0, 2).join('');
  return head === '' ? '?' : head.toLocaleUpperCase('vi');
}

export type LabelTone = 'price' | 'advice' | 'purchase' | 'complaint' | 'spam' | 'neutral';

/** Tông màu chip nhãn; nhãn không thuộc bộ chuẩn (hoặc `other`) → trung tính. */
export function labelTone(label: string | null): LabelTone {
  switch (label) {
    case 'price':
    case 'advice':
    case 'purchase':
    case 'complaint':
    case 'spam':
      return label;
    default:
      return 'neutral';
  }
}

const DONE_TABS: readonly InboxTabKey[] = ['replied', 'hidden', 'skipped', 'all'];

/** Cột trái chia hai cụm: việc đang cần xử lý và việc đã xong/lưu trữ. */
export function inboxTabGroup(tab: InboxTabKey): 'active' | 'done' {
  return DONE_TABS.includes(tab) ? 'done' : 'active';
}
