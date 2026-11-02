import { pino } from 'pino';

/**
 * Trường luôn bị che trước khi ghi log (nguyên tắc bất biến #6: không log token,
 * mật khẩu, email, số điện thoại thô). `*.x` che một cấp lồng nhau.
 * Lưu ý: chỉ che được theo TÊN trường; không đưa dữ liệu nhạy cảm vào chuỗi thông báo.
 */
const SENSITIVE_FIELDS = [
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
  'email',
  'phone',
];

export const REDACT_PATHS = [
  ...SENSITIVE_FIELDS,
  ...SENSITIVE_FIELDS.map((field) => `*.${field}`),
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
];

export function createLogger(options: { level: string }, destination?: NodeJS.WritableStream) {
  return pino(
    { level: options.level, redact: { paths: REDACT_PATHS, censor: '[Đã che]' } },
    destination,
  );
}

export type Logger = ReturnType<typeof createLogger>;
