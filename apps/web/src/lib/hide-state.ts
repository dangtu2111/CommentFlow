/**
 * Chế độ nút Ẩn/Bỏ ẩn của panel chi tiết (FR-044, ADR 009). Thuần: nhận dữ liệu chi tiết bình luận đã đọc từ DB, trả
 * đúng một chế độ. Quyền thật do hàm DB `cf.request_comment_hide` quyết định (cùng điều kiện); ở đây chỉ để hiện/ẩn
 * nút và nêu lý do. "Đã ẩn" chỉ hiện khi nền tảng đã xác nhận (worker ghi `is_hidden`), không bao giờ do bấm nút.
 */
export type HideAction = 'hide' | 'unhide';

export type HideUiDetail = {
  status: string;
  isHidden: boolean;
  /** Khách đã xóa bình luận trên nền tảng (FR-048): không ẩn được. */
  deleted?: boolean;
  channelStatus: string;
  /** Kênh/nền tảng có hỗ trợ hành động (khai báo `capabilities`; docs/08: không hỗ trợ thì không hiện nút). */
  supports: { hide: boolean; unhide: boolean };
  lock: { holderName: string | null; heldByMe: boolean } | null;
  latestHide: { action: HideAction; status: string; errorCode: string | null } | null;
};

export type HideUi =
  | { mode: 'none' }
  | { mode: 'can'; action: HideAction }
  | { mode: 'pending'; action: HideAction }
  | { mode: 'failed'; action: HideAction; errorCode: string | null; canRetry: boolean }
  | {
      mode: 'blocked';
      action: HideAction;
      reason: 'locked_by_other' | 'channel_unavailable' | 'not_hideable';
      holderName?: string | null;
    };

/** Trạng thái bình luận cho phép ẩn (khớp `cf.request_comment_hide`). */
const HIDEABLE = [
  'new',
  'pending_review',
  'needs_human',
  'send_failed',
  'skipped',
  'spam_suspected',
  'replied',
  'auto_replied',
];

export function deriveHideUi(detail: HideUiDetail): HideUi {
  if (detail.deleted) return { mode: 'none' };
  const latest = detail.latestHide;
  const action: HideAction = detail.isHidden ? 'unhide' : 'hide';
  if (latest && (latest.status === 'queued' || latest.status === 'sending')) {
    return { mode: 'pending', action: latest.action };
  }
  if (!detail.supports[action]) return { mode: 'none' };
  const lockedByOther = detail.lock !== null && !detail.lock.heldByMe;
  const channelOk = detail.channelStatus === 'connected';
  if (latest && latest.status === 'failed' && latest.action === action) {
    return {
      mode: 'failed',
      action,
      errorCode: latest.errorCode,
      canRetry: channelOk && !lockedByOther,
    };
  }
  if (lockedByOther) {
    return {
      mode: 'blocked',
      action,
      reason: 'locked_by_other',
      holderName: detail.lock?.holderName ?? null,
    };
  }
  if (!channelOk) return { mode: 'blocked', action, reason: 'channel_unavailable' };
  if (action === 'hide' && !HIDEABLE.includes(detail.status)) {
    return { mode: 'blocked', action, reason: 'not_hideable' };
  }
  return { mode: 'can', action };
}
