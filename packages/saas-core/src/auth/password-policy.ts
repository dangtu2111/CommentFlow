import { createHash } from 'node:crypto';
import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Kiểm mật khẩu đã lộ / quá phổ biến (`docs/13` §2, ADR 004 §3). Áp dụng khi đăng ký và đặt lại mật khẩu,
 * KHÔNG áp dụng khi đăng nhập.
 *  1) Danh sách cục bộ các mật khẩu phổ biến — chạy được khi mất mạng.
 *  2) Have I Been Pwned (k-anonymity): chỉ 5 ký tự đầu của SHA-1 rời máy, kèm `Add-Padding: true`; mật khẩu và phần
 *     còn lại của băm KHÔNG bao giờ rời máy. Lỗi/timeout (mặc định 2 giây) → CHO QUA và ghi cảnh báo (không chặn đăng
 *     ký chỉ vì dịch vụ ngoài sập); danh sách cục bộ vẫn áp dụng.
 */
export type PasswordVerdict = { ok: true } | { ok: false; reason: 'common' | 'pwned' };

/** Cảnh báo vận hành: KHÔNG có mật khẩu, băm, tiền tố băm hay nội dung phản hồi. */
export type PasswordPolicyWarning = {
  event: 'pwned_check_unavailable';
  reason: 'timeout' | 'http' | 'network' | 'oversize';
};

export type PasswordPolicy = {
  check(password: string): Promise<PasswordVerdict>;
};

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const MAX_RESPONSE_CHARS = 2_000_000; // phản hồi thật khoảng 40–60 KB
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

export function createPasswordPolicy(
  options: {
    /** `false` = chỉ danh sách cục bộ (chỉ dev/test/ci được tắt — xem server/env.ts). */
    pwnedEnabled?: boolean;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
    onWarn?: (warning: PasswordPolicyWarning) => void;
  } = {},
): PasswordPolicy {
  const pwnedEnabled = options.pwnedEnabled ?? true;
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 2000;
  const now = options.now ?? Date.now;
  /** prefix → { suffixes bị lộ, hết hạn lúc }. Chỉ lưu tiền tố 5 ký tự và hậu tố từ phản hồi công khai. */
  const cache = new Map<string, { suffixes: Set<string>; expiresAt: number }>();

  async function pwnedSuffixes(prefix: string): Promise<Set<string> | null> {
    const hit = cache.get(prefix);
    if (hit && hit.expiresAt > now()) return hit.suffixes;
    try {
      const response = await doFetch(`${HIBP_RANGE_URL}${prefix}`, {
        method: 'GET',
        headers: { 'Add-Padding': 'true', 'User-Agent': 'CommentFlow-AI-password-check' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      if (!response.ok) {
        options.onWarn?.({ event: 'pwned_check_unavailable', reason: 'http' });
        return null;
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARS) {
        options.onWarn?.({ event: 'pwned_check_unavailable', reason: 'oversize' });
        return null;
      }
      const suffixes = new Set<string>();
      for (const line of text.split(/\r?\n/)) {
        const [suffix = '', count = '0'] = line.trim().split(':');
        // Add-Padding thêm dòng giả có số lần = 0: bỏ qua.
        if (/^[0-9A-F]{35}$/i.test(suffix) && Number(count) > 0) suffixes.add(suffix.toUpperCase());
      }
      if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
      cache.set(prefix, { suffixes, expiresAt: now() + CACHE_TTL_MS });
      return suffixes;
    } catch (error) {
      const timedOut = (error as { name?: string })?.name === 'TimeoutError';
      options.onWarn?.({
        event: 'pwned_check_unavailable',
        reason: timedOut ? 'timeout' : 'network',
      });
      return null;
    }
  }

  return {
    async check(password) {
      if (COMMON_PASSWORDS.has(password.toLowerCase())) return { ok: false, reason: 'common' };
      if (!pwnedEnabled) return { ok: true };
      const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
      const suffixes = await pwnedSuffixes(digest.slice(0, 5));
      if (suffixes?.has(digest.slice(5))) return { ok: false, reason: 'pwned' };
      return { ok: true };
    },
  };
}
