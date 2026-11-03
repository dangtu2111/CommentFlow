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
  'idToken',
  'apiKey',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'client_secret',
  'Authorization',
  'Cookie',
  'password',
  'secret',
  'email',
  'phone',
  'cookie',
  'connectionString',
  'databaseUrl',
];

export const REDACT_PATHS = [
  ...SENSITIVE_FIELDS,
  ...SENSITIVE_FIELDS.map((field) => `*.${field}`),
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  // Lỗi HTTP (axios-like) lồng header/dữ liệu yêu cầu sâu nhiều cấp.
  'err.config.headers.*',
  'err.config.data',
  'err.request.headers.*',
  'err.response.headers.*',
  'error.config.headers.*',
  'error.config.data',
  'error.request.headers.*',
];

export function createLogger(options: { level: string }, destination?: NodeJS.WritableStream) {
  return pino(
    { level: options.level, redact: { paths: REDACT_PATHS, censor: '[Đã che]' } },
    destination,
  );
}

export type Logger = ReturnType<typeof createLogger>;
