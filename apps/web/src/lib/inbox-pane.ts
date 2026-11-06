import { buildInboxHref, type InboxView } from './inbox-filters';

/** Trên mobile (< 900px) trang Bình luận là hai ngăn: danh sách, hoặc chi tiết toàn màn hình khi đã chọn (`?c=`). */
export type InboxMobilePane = 'list' | 'detail';

export function inboxMobilePane(view: InboxView): InboxMobilePane {
  return view.selected ? 'detail' : 'list';
}

/** Liên kết "Quay lại danh sách": giữ tab/lọc/tìm/sắp xếp/con trỏ, chỉ bỏ bình luận đang chọn. */
export function buildInboxBackHref(view: InboxView): string {
  return buildInboxHref(view, { selected: undefined });
}
