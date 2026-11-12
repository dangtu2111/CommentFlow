/**
 * Thông báo sau thao tác bài đăng (tham số `?n=` của Biên tập/Lịch). THUẦN. Chỉ nhận mã đã biết (không bao giờ in chuỗi tự do từ URL ra giao diện).
 */
export const PUBLISH_NOTICES = [
  'saved',
  'scheduled',
  'publishing',
  'cancelled',
  'deleted',
  'publish_disabled',
  'forbidden',
  'unavailable',
  'not_editable',
  'invalid_channel',
  'invalid_schedule',
  'invalid',
  'empty_message',
  'no_channel',
  'rate_limited',
] as const;
export type PublishNoticeCode = (typeof PUBLISH_NOTICES)[number];
export type NoticeVariant = 'success' | 'info' | 'warning' | 'danger';

export function parsePublishNotice(value: string | string[] | undefined): PublishNoticeCode | null {
  const first = Array.isArray(value) ? value[0] : value;
  return (PUBLISH_NOTICES as readonly string[]).includes(first ?? '')
    ? (first as PublishNoticeCode)
    : null;
}

const SUCCESS: ReadonlySet<PublishNoticeCode> = new Set([
  'saved',
  'scheduled',
  'publishing',
  'cancelled',
  'deleted',
]);
const WARNING: ReadonlySet<PublishNoticeCode> = new Set([
  'publish_disabled',
  'invalid_schedule',
  'empty_message',
  'no_channel',
  'invalid_channel',
  'invalid',
  'not_editable',
  'rate_limited',
]);

export function noticeVariant(code: PublishNoticeCode): NoticeVariant {
  if (SUCCESS.has(code)) return 'success';
  if (WARNING.has(code)) return 'warning';
  return 'danger';
}
