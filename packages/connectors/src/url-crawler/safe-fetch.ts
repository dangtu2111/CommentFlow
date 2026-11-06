import { isIP } from 'node:net';
import { UrlCrawlError } from './errors';
import { assertPublicAddresses, parseCrawlUrl } from './ssrf';

export interface TransportRequest {
  url: URL;
  /** IP đã kiểm là công cộng; transport PHẢI kết nối tới đúng IP này (không phân giải lại → chặn DNS rebinding). */
  address: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}

export interface TransportResponse {
  status: number;
  /** Tên header viết thường. */
  headers: Record<string, string>;
  body: Uint8Array;
  /** Nội dung dài hơn `maxBytes` nên đã bị cắt. */
  truncated: boolean;
}

/** Cổng ra mạng: bản thật `createNodeTransport`, test dùng mạng giả. Lỗi phải là `UrlCrawlError` (TIMEOUT/NETWORK_ERROR). */
export interface HttpTransport {
  request(request: TransportRequest): Promise<TransportResponse>;
}

export interface DnsResolver {
  /** Mọi địa chỉ IP (A + AAAA) của tên máy. */
  resolve(hostname: string): Promise<string[]>;
}

export interface SafeFetchOptions {
  userAgent: string;
  /** Mặc định 1 MB. */
  maxBytes?: number;
  /** Mặc định 15 giây (docs/12 §5). */
  timeoutMs?: number;
  /** Mặc định 3. */
  maxRedirects?: number;
  /** Miền Owner khai báo (khớp miền đó và miền con); không đặt = không giới hạn miền. */
  allowedDomains?: readonly string[];
  /** Mặc định HTML + văn bản thuần. */
  acceptContentTypes?: readonly string[];
  /**
   * Gọi ở MỖI chặng (kể cả chuyển hướng) sau khi URL đã qua kiểm SSRF và trước khi gửi yêu cầu: dùng để chờ giới hạn
   * tốc độ và kiểm robots.txt của đúng host đang tải. Ném lỗi để hủy chặng này.
   */
  beforeRequest?: (url: URL) => Promise<void>;
}

export interface SafeFetchResult {
  finalUrl: URL;
  status: number;
  /** Chỉ phần `type/subtype`, viết thường; rỗng nếu trạng thái không phải 2xx và không có header. */
  contentType: string;
  body: Uint8Array;
  truncated: boolean;
}

const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_ACCEPT = ['text/html', 'application/xhtml+xml', 'text/plain'];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isDomainAllowed(hostname: string, allowedDomains: readonly string[] | undefined): boolean {
  if (!allowedDomains) return true;
  const host = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

async function resolveAddresses(hostname: string, resolver: DnsResolver): Promise<string[]> {
  const literal = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  if (isIP(literal) !== 0) return [literal];
  try {
    return await resolver.resolve(hostname);
  } catch (cause) {
    throw new UrlCrawlError('DNS_FAILED', { cause });
  }
}

/**
 * Tải một URL công khai an toàn (chống SSRF): chỉ http/https, cổng mặc định, phân giải DNS rồi từ chối nếu BẤT KỲ
 * địa chỉ nào là nội bộ, kết nối thẳng tới IP đã kiểm, tự xử lý chuyển hướng (mỗi chặng kiểm lại từ đầu), giới hạn
 * dung lượng/thời gian/loại nội dung, không nhận nội dung nén. Trạng thái HTTP lỗi trả nguyên cho người gọi.
 */
export async function safeFetch(
  rawUrl: string,
  deps: { transport: HttpTransport; resolver: DnsResolver },
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const accept = (options.acceptContentTypes ?? DEFAULT_ACCEPT).map((type) => type.toLowerCase());
  let current = rawUrl;

  for (let hop = 0; ; hop += 1) {
    const url = parseCrawlUrl(current);
    if (!isDomainAllowed(url.hostname, options.allowedDomains))
      throw new UrlCrawlError('DOMAIN_NOT_ALLOWED');
    const addresses = await resolveAddresses(url.hostname, deps.resolver);
    assertPublicAddresses(addresses);
    await options.beforeRequest?.(url);

    const response = await deps.transport.request({
      url,
      address: addresses[0]!,
      headers: {
        'user-agent': options.userAgent,
        accept: accept.join(', '),
        'accept-encoding': 'identity',
      },
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    });

    const location = response.headers.location;
    if (REDIRECT_STATUSES.has(response.status) && location) {
      if (hop >= maxRedirects) throw new UrlCrawlError('REDIRECT_LIMIT');
      try {
        current = new URL(location, url).href;
      } catch (cause) {
        throw new UrlCrawlError('INVALID_URL', { cause });
      }
      continue;
    }

    const contentType = (response.headers['content-type'] ?? '')
      .split(';', 1)[0]!
      .trim()
      .toLowerCase();
    if (response.status >= 200 && response.status < 300) {
      const encoding = (response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
      if (encoding !== 'identity' || !accept.includes(contentType))
        throw new UrlCrawlError('UNSUPPORTED_CONTENT');
    }
    return {
      finalUrl: url,
      status: response.status,
      contentType,
      body: response.body,
      truncated: response.truncated,
    };
  }
}
