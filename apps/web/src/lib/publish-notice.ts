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
  'moved',
  'updated',
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
  'moved',
  'updated',
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

/** Kết quả LỖI của "Lưu nháp / Lên lịch / Đăng ngay" trả về cho Biên tập (không chuyển trang → giữ nguyên thông tin đã nhập). `postId`: bài đã được tạo (đừng tạo trùng ở lần bấm sau). */
export type SaveFailure = { notice: PublishNoticeCode; postId?: string };
export type SaveState = SaveFailure | null;

/** Mã thông báo mang ý nghĩa thành công (chuyển trang như cũ); mã khác là lỗi/cảnh báo → ở lại trang, giữ dữ liệu. */
export function isSuccessNotice(code: PublishNoticeCode): boolean {
  return noticeVariant(code) === 'success';
}
