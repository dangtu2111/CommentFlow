/** Lý do một lần nhập link website bị dừng (FR-053). Giao diện/worker chuyển thành thông báo cho Owner. */
export const URL_CRAWL_REASONS = [
  'INVALID_URL',
  'SCHEME_NOT_ALLOWED',
  'PORT_NOT_ALLOWED',
  'HOST_BLOCKED',
  'DOMAIN_NOT_ALLOWED',
  'DNS_FAILED',
  'REDIRECT_LIMIT',
  'TIMEOUT',
  'NETWORK_ERROR',
  'BAD_STATUS',
  'UNSUPPORTED_CONTENT',
  'ROBOTS_DISALLOWED',
  'EMPTY_CONTENT',
] as const;
export type UrlCrawlReason = (typeof URL_CRAWL_REASONS)[number];

const MESSAGES: Record<UrlCrawlReason, string> = {
  INVALID_URL: 'Link không hợp lệ.',
  SCHEME_NOT_ALLOWED: 'Chỉ nhận link http hoặc https.',
  PORT_NOT_ALLOWED: 'Chỉ nhận cổng mặc định của http/https.',
  HOST_BLOCKED: 'Địa chỉ này không được phép truy cập.',
  DOMAIN_NOT_ALLOWED: 'Tên miền chưa nằm trong danh sách miền của shop.',
  DNS_FAILED: 'Không tìm thấy máy chủ của link.',
  REDIRECT_LIMIT: 'Link chuyển hướng quá nhiều lần.',
  TIMEOUT: 'Trang phản hồi quá chậm.',
  NETWORK_ERROR: 'Không tải được trang.',
  BAD_STATUS: 'Trang trả về lỗi.',
  UNSUPPORTED_CONTENT: 'Trang không phải văn bản/HTML.',
  ROBOTS_DISALLOWED: 'Website không cho phép robot đọc trang này (robots.txt).',
  EMPTY_CONTENT: 'Trang không có nội dung văn bản để nhập.',
};

/** Lỗi có mã lý do; `cause` giữ nguyên nhân gốc để truy vết, không đưa ra ngoài. */
export class UrlCrawlError extends Error {
  readonly reason: UrlCrawlReason;

  constructor(reason: UrlCrawlReason, options?: { cause?: unknown }) {
    super(MESSAGES[reason], options);
    this.name = 'UrlCrawlError';
    this.reason = reason;
  }
}
