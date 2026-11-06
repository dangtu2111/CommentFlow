import { normalizeIp } from '../ratelimit/keys';

/**
 * Che IP phiên trước khi LƯU và trước khi HIỂN THỊ (riêng tư, docs/13 §2): IPv4 giữ 2 octet đầu (`113.161.x.x`), IPv6 giữ 2
 * nhóm đầu. Không phải IP (kể cả chuỗi lạ như "unknown") → null để không lộ nội dung không kiểm soát. Idempotent.
 */
const MASKED_V4 = /^\d{1,3}\.\d{1,3}\.x\.x$/;
const MASKED_V6 = /^[0-9a-f]{1,4}:[0-9a-f]{1,4}(:x){6}$/;

export function maskIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (MASKED_V4.test(value) || MASKED_V6.test(value)) return value;
  const ip = normalizeIp(value);
  if (!ip) return null;
  if (ip.startsWith('v6:')) {
    const groups = ip
      .slice(3)
      .split(':')
      .map((g) => g.replace(/^0+(?=.)/, ''));
    return `${groups[0]}:${groups[1]}:x:x:x:x:x:x`;
  }
  const [a, b] = ip.split('.');
  return `${a}.${b}.x.x`;
}
