import { createHash } from 'node:crypto';
import { UrlCrawlError } from './errors';
import { extractCleanText, normalizeExtractedText } from './extract-text';
import {
  crawlDelayFor,
  isAllowedByRobots,
  parseRobots,
  ROBOTS_ALLOW_ALL,
  ROBOTS_DISALLOW_ALL,
  type RobotsRules,
} from './robots';
import {
  type DnsResolver,
  type HttpTransport,
  type SafeFetchOptions,
  safeFetch,
} from './safe-fetch';
import { createHostThrottle, type HostThrottle } from './throttle';

export interface PolicyPageDeps {
  transport: HttpTransport;
  resolver: DnsResolver;
  /** Mặc định: mỗi host cách nhau 2 giây (dùng chung giữa nhiều lần gọi bằng cách tiêm cùng một đối tượng). */
  throttle?: HostThrottle;
  now?: () => Date;
}

export interface PolicyPageOptions {
  /** Mặc định `CommentFlowBot/1.0`. Phần trước `/` là tên bot dùng để chọn nhóm trong robots.txt. */
  userAgent?: string;
  /** Miền Owner khai báo (docs/12 §5); không đặt = không giới hạn miền. */
  allowedDomains?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  /** Trần số ký tự văn bản giữ lại (mặc định 200.000). */
  maxTextChars?: number;
}

export interface PolicyPageImport {
  /** URL cuối cùng sau chuyển hướng (đã bỏ phần `#...`). */
  url: string;
  title: string | undefined;
  text: string;
  /** SHA-256 của văn bản đã chuẩn hóa (FR-055): đổi định dạng/khoảng trắng không đổi băm, đổi chữ thì đổi. */
  contentHash: string;
  /** Tải bị cắt theo dung lượng hoặc văn bản bị cắt theo số ký tự. */
  truncated: boolean;
  fetchedAt: Date;
  /** Luôn `true`: trang crawl không bao giờ tự xuất bản, phải qua hàng chờ duyệt (FR-053, FR-164). */
  requiresReview: true;
}

const DEFAULT_USER_AGENT = 'CommentFlowBot/1.0';
const MAX_ROBOTS_BYTES = 512_000;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** RFC 9309: 2xx → đọc; 4xx → không có robots (cho phép); 5xx/không rõ → coi như cấm để an toàn. */
async function loadRobots(
  url: URL,
  deps: PolicyPageDeps,
  throttle: HostThrottle,
  fetchOptions: SafeFetchOptions,
): Promise<RobotsRules> {
  try {
    const response = await safeFetch(`${url.origin}/robots.txt`, deps, {
      ...fetchOptions,
      acceptContentTypes: ['text/plain'],
      maxBytes: MAX_ROBOTS_BYTES,
      beforeRequest: (hop) => throttle.wait(hop.host),
    });
    if (response.status >= 200 && response.status < 300)
      return parseRobots(decodeUtf8(response.body));
    return response.status >= 400 && response.status < 500 ? ROBOTS_ALLOW_ALL : ROBOTS_DISALLOW_ALL;
  } catch (error) {
    // robots.txt không phải văn bản/chuyển hướng vô hạn = website cấu hình hỏng → cấm. Lỗi mạng và lỗi bảo mật lan ra.
    const unreadable =
      error instanceof UrlCrawlError &&
      (error.reason === 'UNSUPPORTED_CONTENT' || error.reason === 'REDIRECT_LIMIT');
    if (unreadable) return ROBOTS_DISALLOW_ALL;
    throw error;
  }
}

/**
 * Nhập một trang chính sách từ link website (FR-053): kiểm URL (SSRF) → với MỖI host trên đường đi: tải robots.txt,
 * kiểm quyền, chờ giới hạn tốc độ (+ Crawl-delay) → tải trang (giới hạn dung lượng/thời gian/loại nội dung) → tách
 * văn bản sạch + băm. Không chạy JavaScript. Kết quả luôn `requiresReview` — chưa ghi DB/xuất bản ở đây.
 */
export async function fetchPolicyPage(
  rawUrl: string,
  deps: PolicyPageDeps,
  options: PolicyPageOptions,
): Promise<PolicyPageImport> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const botToken = userAgent.split(/[/\s]/, 1)[0]!;
  const throttle = deps.throttle ?? createHostThrottle();
  const fetchOptions: SafeFetchOptions = {
    userAgent,
    ...(options.allowedDomains ? { allowedDomains: options.allowedDomains } : {}),
    ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
  const robotsByOrigin = new Map<string, RobotsRules>();

  const response = await safeFetch(rawUrl, deps, {
    ...fetchOptions,
    beforeRequest: async (hop) => {
      let rules = robotsByOrigin.get(hop.origin);
      if (!rules) {
        rules = await loadRobots(hop, deps, throttle, fetchOptions);
        robotsByOrigin.set(hop.origin, rules);
      }
      if (!isAllowedByRobots(rules, botToken, `${hop.pathname}${hop.search}`)) {
        throw new UrlCrawlError('ROBOTS_DISALLOWED');
      }
      await throttle.wait(hop.host, crawlDelayFor(rules, botToken));
    },
  });
  if (response.status < 200 || response.status >= 300) throw new UrlCrawlError('BAD_STATUS');

  const raw = decodeUtf8(response.body);
  const maxChars = options.maxTextChars;
  const extracted =
    response.contentType === 'text/plain'
      ? { title: undefined, ...limit(normalizeExtractedText(raw), maxChars) }
      : extractCleanText(raw, maxChars === undefined ? {} : { maxChars });
  if (extracted.text === '') throw new UrlCrawlError('EMPTY_CONTENT');

  return {
    url: response.finalUrl.href,
    title: extracted.title,
    text: extracted.text,
    contentHash: createHash('sha256').update(extracted.text, 'utf8').digest('hex'),
    truncated: response.truncated || extracted.truncated,
    fetchedAt: (deps.now ?? (() => new Date()))(),
    requiresReview: true,
  };
}

function limit(text: string, maxChars: number | undefined): { text: string; truncated: boolean } {
  if (maxChars === undefined || text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars).trimEnd(), truncated: true };
}
