/**
 * Lý do ẩn/bỏ ẩn lỗi dễ hiểu (FR-044): ánh xạ `comment_hides.error_code` → khóa i18n. Mã chỉ là mã an toàn
 * (`PlatformErrorCode`, `recheck:H#`, `connector_unavailable`, …); mã lạ/thiếu → khóa chung. Không bao giờ trả chuỗi
 * chứa nội dung người dùng/token.
 */
const CODE_TO_KEY = {
  TOKEN_EXPIRED: 'tokenExpired',
  PERMISSION: 'permission',
  BLOCKED: 'blocked',
  RATE_LIMIT: 'rateLimit',
  UNKNOWN: 'unknown',
  'recheck:H1': 'recheckH1',
  'recheck:H2': 'recheckH2',
  'recheck:H3': 'recheckH3',
  connector_unavailable: 'connectorUnavailable',
  ACTION_UNSUPPORTED: 'actionUnsupported',
  WINDOW_EXPIRED: 'windowExpired',
  retries_exhausted: 'retriesExhausted',
} as const;

export type HideErrorKey = (typeof CODE_TO_KEY)[keyof typeof CODE_TO_KEY] | 'generic';
export const HIDE_ERROR_KEYS: readonly HideErrorKey[] = [
  ...(Object.values(CODE_TO_KEY) as HideErrorKey[]),
  'generic',
];

export function hideErrorKey(code: string | null | undefined): HideErrorKey {
  if (code && Object.hasOwn(CODE_TO_KEY, code))
    return CODE_TO_KEY[code as keyof typeof CODE_TO_KEY];
  return 'generic';
}
