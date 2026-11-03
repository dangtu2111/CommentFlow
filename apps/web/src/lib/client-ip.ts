import { isIP } from 'node:net';

/**
 * Nguồn địa chỉ IP của khách (ADR 004 §2):
 * - `none` (dev/LAN, mặc định): KHÔNG lấy IP. Next ở dev tự đặt `X-Forwarded-For` nhưng giữ nguyên giá trị client tự đặt,
 *   nên không có IP kết nối đáng tin; rate limit chỉ dùng xô theo email.
 * - `cf-connecting-ip` (chỉ staging): header do Cloudflare ghi đè. Chỉ đúng khi cổng web KHÔNG truy cập được
 *   trực tiếp ngoài `cloudflared` (nếu truy cập được, client tự đặt header này).
 * Không bao giờ đọc `X-Forwarded-For`/`X-Real-IP`. Không có IP → undefined (không dùng khóa chung "unknown").
 */
export type ClientIpSource = 'none' | 'cf-connecting-ip';

export function clientIpFrom(headers: Headers, source: ClientIpSource): string | undefined {
  if (source === 'none') return undefined;
  const value = headers.get('cf-connecting-ip')?.trim();
  return value && isIP(value) ? value : undefined;
}
