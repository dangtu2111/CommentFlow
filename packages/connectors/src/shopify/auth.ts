import { z } from 'zod';
import { PlatformError, type PlatformErrorCode } from '../errors';

/**
 * Đổi Client ID + Client secret của ứng dụng Shopify (Dev Dashboard) lấy token Admin API — luồng "client credentials":
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 * `POST https://{shop}.myshopify.com/admin/oauth/access_token` (form: grant_type, client_id, client_secret) → `{ access_token,
 * scope, expires_in }`; token sống ~24 giờ và KHÔNG có refresh token nên gọi lại mỗi lần đồng bộ. Chỉ dùng được khi ứng dụng và
 * cửa hàng thuộc cùng tổ chức Dev Dashboard (lỗi khác → 403/400).
 *
 * An toàn: tên miền phải đúng `<tên>.myshopify.com` (chặn SSRF); không theo chuyển hướng; có hạn giờ; thân phản hồi bị chặn
 * trần; bí mật chỉ nằm trong thân yêu cầu, KHÔNG vào URL/thông báo lỗi/log.
 */
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_RETRY_AFTER_SECONDS = 300;

export type ShopifyClientCredentialsOptions = {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type ShopifyAccessToken = { accessToken: string; scope: string; expiresInSeconds: number };

const responseSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string().optional(),
  expires_in: z.number().positive(),
});

const fail = (
  code: PlatformErrorCode,
  message: string,
  retryAfterSeconds?: number,
): PlatformError =>
  new PlatformError(code, {
    message,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

function retryAfterOf(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
}

async function readBounded(response: Response): Promise<string> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw fail('UNKNOWN', 'shopify_bad_response');
  return text;
}

export async function exchangeShopifyClientCredentials(
  options: ShopifyClientCredentialsOptions,
): Promise<ShopifyAccessToken> {
  const { shopDomain, clientId, clientSecret } = options;
  if (!SHOP_DOMAIN.test(shopDomain)) {
    throw new Error('shopDomain phải có dạng <tên>.myshopify.com.');
  }
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
  } catch {
    // Không giữ lỗi gốc: thông điệp của tầng mạng có thể chứa URL/chi tiết yêu cầu.
    throw fail('UNKNOWN', 'shopify_network_error');
  }
  if (response.status === 429) {
    await response.body?.cancel();
    throw fail('RATE_LIMIT', 'shopify_rate_limited', retryAfterOf(response.headers));
  }
  if (response.status === 400 || response.status === 401) {
    await response.body?.cancel();
    throw fail('TOKEN_EXPIRED', 'shopify_invalid_credentials');
  }
  if (response.status === 403) {
    await response.body?.cancel();
    throw fail('PERMISSION', 'shopify_not_permitted');
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw fail('UNKNOWN', 'shopify_bad_response');
  }
  let json: unknown;
  try {
    json = JSON.parse(await readBounded(response));
  } catch (error) {
    if (error instanceof PlatformError) throw error;
    throw fail('UNKNOWN', 'shopify_bad_response');
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw fail('UNKNOWN', 'shopify_bad_response');
  return {
    accessToken: parsed.data.access_token,
    scope: parsed.data.scope ?? '',
    expiresInSeconds: parsed.data.expires_in,
  };
}
