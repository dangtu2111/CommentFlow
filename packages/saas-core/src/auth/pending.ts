import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cookie KÝ "đang chờ nhập mã 2FA". Chỉ được cấp SAU KHI mật khẩu đúng và chứa email của người vừa qua bước đó.
 * Dùng để đếm rate limit nhập mã 2FA theo đúng người dùng: cookie `two_factor` của plugin không cho biết người dùng
 * (bản ghi verifications của nó không chứa userId), và không được tin email do client gửi lên (kẻ tấn công sẽ đổi email
 * để né giới hạn). Chữ ký HMAC-SHA256 bằng khóa bí mật của server nên client không giả được.
 */
const DOMAIN = 'cf-2fa-pending-v1';

const mac = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(`${DOMAIN}\u0000${payload}`).digest('base64url');

export function signPending(
  secret: string,
  email: string,
  options: { ttlSeconds?: number; now?: () => number } = {},
): string {
  const now = options.now ?? Date.now;
  const expiresAt = Math.floor(now() / 1000) + (options.ttlSeconds ?? 600);
  const payload = Buffer.from(JSON.stringify({ e: email, x: expiresAt })).toString('base64url');
  return `${payload}.${mac(secret, payload)}`;
}

/** @returns email nếu chữ ký đúng và chưa hết hạn; ngược lại null. */
export function verifyPending(
  secret: string,
  token: string | undefined,
  now: () => number = Date.now,
): string | null {
  if (!token || token.length > 1024) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(secret, payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      e?: unknown;
      x?: unknown;
    };
    if (typeof data.e !== 'string' || typeof data.x !== 'number') return null;
    return data.x * 1000 > now() ? data.e : null;
  } catch {
    return null;
  }
}
