/**
 * Lý do gửi lỗi dễ hiểu (FR-042, US-016): ánh xạ `comment_replies.error_code` → khóa i18n. Mã chỉ là mã an toàn
 * (`PlatformErrorCode`, `recheck:R#`, `connector_unavailable`, …); mã lạ/thiếu → khóa chung. Không bao giờ trả
 * chuỗi chứa nội dung người dùng/token.
 */
const CODE_TO_KEY = {
  TOKEN_EXPIRED: 'tokenExpired',
  PERMISSION: 'permission',
  BLOCKED: 'blocked',
  RATE_LIMIT: 'rateLimit',
  UNKNOWN: 'unknown',
  'recheck:R1': 'recheckR1',
  'recheck:R2': 'recheckR2',
  'recheck:R3': 'recheckR3',
  'recheck:R4': 'recheckR4',
  'recheck:R5': 'recheckR5',
  'recheck:R6': 'recheckR6',
  'recheck:R7': 'recheckR7',
  'recheck:R8': 'recheckR8',
  'recheck:R9': 'recheckR9',
  'recheck:input': 'recheckInput',
  connector_unavailable: 'connectorUnavailable',
  ACTION_UNSUPPORTED: 'actionUnsupported',
  WINDOW_EXPIRED: 'windowExpired',
  TEXT_TOO_LONG: 'textTooLong',
  retries_exhausted: 'retriesExhausted',
} as const;

export type ReplyErrorKey = (typeof CODE_TO_KEY)[keyof typeof CODE_TO_KEY] | 'generic';
export const REPLY_ERROR_KEYS: readonly ReplyErrorKey[] = [
  ...(Object.values(CODE_TO_KEY) as ReplyErrorKey[]),
  'generic',
];

export function replyErrorKey(code: string | null | undefined): ReplyErrorKey {
  if (code && Object.hasOwn(CODE_TO_KEY, code))
    return CODE_TO_KEY[code as keyof typeof CODE_TO_KEY];
  return 'generic';
}
