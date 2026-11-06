import type { ReactNode } from 'react';

/** Thẻ <b>…</b> trong chuỗi i18n → <strong> (dùng với `t.rich(key, { ...RICH_BOLD, ... })`). */
export const RICH_BOLD = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };

/** Tông màu viết một lần ở module để khỏi bị quy tắc "không chuỗi chữ trong JSX" coi là văn bản giao diện. */
export const TONE = {
  primary: 'primary',
  neutral: 'neutral',
  accent: 'accent',
  warm: 'warm',
  danger: 'danger',
} as const;
