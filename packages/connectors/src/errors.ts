/** Mã lỗi chuẩn mọi connector trả về (docs/12 §9, §1 "Lỗi thường gặp"): pipeline chỉ cần biết 5 mã này. */
export const PLATFORM_ERROR_CODES = [
  /** Token hết hạn/không hợp lệ (Meta mã 190) → kênh `token_expired` + banner Kết nối lại. */
  'TOKEN_EXPIRED',
  /** Thiếu quyền (Meta 10/200) → kênh `revoked`. */
  'PERMISSION',
  /** Giới hạn tốc độ (Meta 4/17/32/613) → lùi dần (backoff). */
  'RATE_LIMIT',
  /** Bị chặn tạm (Meta 368) → tạm khóa gửi kênh 24 giờ + cảnh báo Owner/Admin. */
  'BLOCKED',
  'UNKNOWN',
] as const;
export type PlatformErrorCode = (typeof PLATFORM_ERROR_CODES)[number];

/** Lỗi đã chuẩn hóa từ nền tảng. `cause` giữ lỗi gốc để truy vết nhưng không bao giờ đưa ra ngoài/log nguyên văn. */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  /** Gợi ý chờ bao lâu (giây) trước khi thử lại, nếu nền tảng cho biết. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: PlatformErrorCode,
    options: { message?: string; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(
      options.message ?? code,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'PlatformError';
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const isPlatformError = (value: unknown): value is PlatformError =>
  value instanceof PlatformError;
