/** Mã lỗi dùng thống nhất toàn hệ thống; mỗi mã có mã HTTP tương ứng. */
const HTTP_STATUS = {
  CONFIG_INVALID: 500,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  /** Hạn mức chi phí AI của tháng đã hết (cổng chi phí, FR-071). */
  COST_CAP_REACHED: 402,
  LLM_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof HTTP_STATUS;

/**
 * Lỗi có mã + thông báo dễ hiểu. `cause` giữ nguyên nhân gốc để truy vết nhưng
 * không bao giờ được đưa ra ngoài qua `toJSON` (có thể chứa dữ liệu nhạy cảm).
 */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  toJSON(): { code: ErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
