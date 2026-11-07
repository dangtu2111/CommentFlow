import { createHmac } from 'node:crypto';

/**
 * Đăng nhập tự động CHỈ cho dev (route `/dev/login`): hàm quyết định thuần, tách khỏi Next để kiểm bằng bảng.
 * Không nới cổng `requireAppUser`/`decideAppAccess`; route tạo MỘT PHIÊN THẬT cho Owner mẫu của seed rồi để cổng
 * kiểm như mọi phiên khác. Sai BẤT KỲ khóa nào → `{ allowed: false }` (route trả 404, không nói lý do).
 */
export const DEV_AUTO_LOGIN_FLAG = 'DEV_AUTO_LOGIN';
export const DEV_DATABASE = 'cf_dev';
/** Khớp `tools/dev-seed` (web không import được tools): Owner + workspace mẫu do `pnpm dev:seed-demo` tạo. */
export const DEV_OWNER_EMAIL = 'owner.mau@example.test';
export const DEV_WORKSPACE_NAME = '[MẪU] Demo Shop';
export const DEV_NAME_TAG = '[MẪU]';
export const DEFAULT_NEXT = '/app/settings';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_NEXT_LENGTH = 200;

export type DevAutoLoginInput = {
  nodeEnv: string | undefined;
  appEnv: string | undefined;
  databaseUrl: string | undefined;
  databaseAuthUrl: string | undefined;
  flag: string | undefined;
  /** Header `Host` của request. */
  host: string | null;
  /** Có header `x-forwarded-*`/`forwarded` (đi qua proxy/tunnel) → từ chối. */
  forwarded: boolean;
  next: string | null;
};

export type DevAutoLoginDecision = { allowed: false } | { allowed: true; next: string };

/** Tên database của một URL kết nối; null nếu URL hỏng, thiếu host hoặc có tham số truy vấn (`?host=`/`?options=`). */
function databaseNameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.search !== '' || parsed.hostname === '') return null;
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
}

const LOOPBACK_HOST_RE = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopbackHost(host: string | null): boolean {
  return host !== null && LOOPBACK_HOST_RE.test(host);
}

/**
 * Có dấu đi qua proxy/tunnel không. Next tự đặt `x-forwarded-*` cho mọi request (giá trị loopback khi gọi trực tiếp),
 * nên chỉ coi là proxy khi `forwarded` có mặt hoặc `x-forwarded-for` chứa địa chỉ KHÔNG phải loopback.
 */
export function isProxiedRequest(input: {
  forwarded: string | null;
  xForwardedFor: string | null;
}): boolean {
  if (input.forwarded !== null) return true;
  if (input.xForwardedFor === null) return false;
  return input.xForwardedFor
    .split(',')
    .map((part) => part.trim())
    .some((address) => !LOOPBACK_ADDRESSES.has(address));
}

function hasControlChar(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

/** Chỉ nhận đường dẫn nội bộ `/app` hoặc `/app/...` (chống open redirect); khác → mặc định. */
export function safeNextPath(next: string | null): string {
  if (!next || next.length > MAX_NEXT_LENGTH) return DEFAULT_NEXT;
  if (!/^\/app(?:[/?#]|$)/.test(next)) return DEFAULT_NEXT;
  if (next.includes('//') || next.includes('\\') || hasControlChar(next)) {
    return DEFAULT_NEXT;
  }
  if (/%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i.test(next)) return DEFAULT_NEXT;
  return next;
}

export function decideDevAutoLogin(input: DevAutoLoginInput): DevAutoLoginDecision {
  if (input.nodeEnv === undefined || input.nodeEnv === 'production') return { allowed: false };
  if (input.appEnv !== 'dev') return { allowed: false };
  if (input.flag !== '1') return { allowed: false };
  if (databaseNameOf(input.databaseUrl) !== DEV_DATABASE) return { allowed: false };
  if (databaseNameOf(input.databaseAuthUrl) !== DEV_DATABASE) return { allowed: false };
  if (input.forwarded || !isLoopbackHost(input.host)) return { allowed: false };
  return { allowed: true, next: safeNextPath(input.next) };
}

/**
 * Giá trị cookie phiên ký đúng cách của Better Auth (better-call): `encodeURIComponent(token + '.' + base64(HMAC-SHA256(secret, token)))`.
 */
export function signSessionCookieValue(token: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}
