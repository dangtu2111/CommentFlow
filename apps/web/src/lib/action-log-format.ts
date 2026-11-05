/** Định dạng hiển thị của trang Nhật ký (FR-092). Thuần để test được. */

/** Mã hành động đã có nhãn dịch (`activity.actions.<khóa>`); mã khác hiện nguyên mã. */
const KNOWN_ACTIONS = [
  'workspace.created',
  'member.role_changed',
  'member.left',
  'invitation.created',
  'invitation.accepted',
  'invitation.revoked',
  'channel.connected',
  'channel.reconnected',
  'channel.token_set',
  'channel.token_cleared',
  'comment.reply_requested',
  'comment.hide_requested',
  'comment.hide_cancelled',
  'comment.unhide_requested',
  'comment.hidden',
  'comment.unhidden',
] as const;

export function actionLabelKey(action: string): string | null {
  return (KNOWN_ACTIONS as readonly string[]).includes(action) ? action : null;
}

/** Giá trị trước/sau thành chuỗi hiển thị (React tự thoát ký tự; log không chứa token/PII theo thiết kế). */
export function formatLogValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export type DiffRow = {
  key: string;
  before: string | null;
  after: string | null;
  changed: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Hợp khóa của `before` và `after` (sắp theo tên); `changed` khi giá trị hai phía khác nhau. */
export function diffRows(before: unknown, after: unknown): DiffRow[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].sort().map((key) => {
    const beforeText = key in b ? formatLogValue(b[key]) : null;
    const afterText = key in a ? formatLogValue(a[key]) : null;
    return { key, before: beforeText, after: afterText, changed: beforeText !== afterText };
  });
}

export type OnBehalfOfDisplay =
  | { kind: 'self' }
  | { kind: 'named'; name: string }
  | { kind: 'former' };

/**
 * Cách hiển thị "Hệ thống (theo yêu cầu của …)" cho dòng `system` có người yêu cầu (`on_behalf_of`). `null` khi không có.
 * Chính người xem → `self`; người khác có tên → `named`; không còn tên → `former` (không bao giờ hiện mã người dùng).
 */
export function onBehalfOfDisplay(
  onBehalfOfId: string | null,
  onBehalfOfName: string | null,
  viewerId: string,
): OnBehalfOfDisplay | null {
  if (!onBehalfOfId) return null;
  if (onBehalfOfId === viewerId) return { kind: 'self' };
  return onBehalfOfName ? { kind: 'named', name: onBehalfOfName } : { kind: 'former' };
}
