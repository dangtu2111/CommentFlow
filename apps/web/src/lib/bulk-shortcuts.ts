/**
 * Phím tắt của hành động hàng loạt (docs/08, QB3). Hàm thuần để test; thành phần React chỉ đọc sự kiện rồi gọi hàm này.
 * `H` chỉ MỞ hộp xác nhận ẩn — không bao giờ ẩn trực tiếp. Phím bị bỏ qua khi đang gõ hoặc có Ctrl/⌘/Alt.
 */
export type BulkShortcut =
  | 'focus_next'
  | 'focus_prev'
  | 'toggle_focused'
  | 'open_hide_confirm'
  | 'clear';

export type KeyInfo = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** Đang gõ trong ô nhập/textarea/select/contenteditable. */
  typing: boolean;
};

export function resolveBulkShortcut(event: KeyInfo, selectedCount: number): BulkShortcut | null {
  if (event.typing || event.ctrl || event.meta || event.alt) return null;
  switch (event.key.toLowerCase()) {
    case 'j':
      return 'focus_next';
    case 'k':
      return 'focus_prev';
    case 'x':
      return 'toggle_focused';
    case 'h':
      return selectedCount > 0 ? 'open_hide_confirm' : null;
    case 'escape':
      return selectedCount > 0 ? 'clear' : null;
    default:
      return null;
  }
}
