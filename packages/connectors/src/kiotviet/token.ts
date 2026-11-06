import { z } from 'zod';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';
import { readBoundedText, retryAfterHeader } from './connector';

/**
 * Xin token KiotViet theo OAuth2 client credentials (FR-122, docs/12 §4, Q-KIO1): POST form tới máy chủ cố định
 * `https://id.kiotviet.vn/connect/token` (`scopes=PublicApi.Access`). Client ID/Secret do cửa hàng tạo, lấy qua
 * `getCredentials` (nơi dựng đọc từ kho bí mật theo workspace — chưa có, gap `KIOTVIET-CONNECT-STORE`); không bao giờ
 * vào URL/log/lỗi. Token nhớ trong bộ nhớ tiến trình đến gần hết hạn; các lời gọi đồng thời dùng chung một lần xin;
 * lỗi không được nhớ. Chưa kiểm với dịch vụ thật.
 */

const TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
/** Xin mới trước hạn ngần này để không dùng token sắp hết hiệu lực giữa chừng một job. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export type KiotVietCredentials = { clientId: string; clientSecret: string };

export type KiotVietTokenProviderOptions = {
  getCredentials: () => Promise<KiotVietCredentials>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Đồng hồ (ms); tiêm ở test. */
  now?: () => number;
};

const fail = (
  code: PlatformErrorCode,
  message: string,
  retryAfterSeconds?: number,
): PlatformError =>
  new PlatformError(code, {
    message,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

function failureOfStatus(response: Response): PlatformError {
  const { status } = response;
  if (status === 429)
    return fail('RATE_LIMIT', 'kiotviet_rate_limited', retryAfterHeader(response.headers));
  if (status === 400 || status === 401) return fail('TOKEN_EXPIRED', 'kiotviet_token_rejected');
  return fail('UNKNOWN', 'kiotviet_token_http_error');
}

export function createKiotVietTokenProvider(
  options: KiotVietTokenProviderOptions,
): () => Promise<string> {
  const {
    getCredentials,
    fetch: fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = Date.now,
  } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}].`);
  }
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function request(): Promise<string> {
    let credentials: KiotVietCredentials;
    try {
      credentials = await getCredentials();
    } catch (error) {
      throw isPlatformError(error)
        ? error
        : fail('TOKEN_EXPIRED', 'kiotviet_credentials_unavailable');
    }
    let response: Response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          scopes: 'PublicApi.Access',
          grant_type: 'client_credentials',
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
        }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw fail('UNKNOWN', 'kiotviet_network_error');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw failureOfStatus(response);
    }
    let parsed: z.infer<typeof tokenSchema>;
    try {
      parsed = tokenSchema.parse(JSON.parse(await readBoundedText(response)));
    } catch (error) {
      throw isPlatformError(error) ? error : fail('UNKNOWN', 'kiotviet_bad_response');
    }
    cached = {
      token: parsed.access_token,
      expiresAt: now() + parsed.expires_in * 1000 - EXPIRY_SKEW_MS,
    };
    return parsed.access_token;
  }

  return async function getToken() {
    if (cached !== null && now() < cached.expiresAt) return cached.token;
    inflight ??= request().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
