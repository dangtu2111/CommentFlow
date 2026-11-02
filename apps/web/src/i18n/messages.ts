import type { Locale } from '@flow/shared';
import en from '@flow/shared/messages/en.json';
import vi from '@flow/shared/messages/vi.json';

// Import tĩnh (không dùng import động theo tên) để bộ đóng gói gom đủ cả hai bản dịch.
const MESSAGES = { vi, en } satisfies Record<Locale, typeof vi>;

export function getMessages(locale: Locale): typeof vi {
  return MESSAGES[locale];
}
