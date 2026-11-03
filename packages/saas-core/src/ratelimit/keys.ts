import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

/** Email dùng làm danh tính: bỏ khoảng trắng đầu/cuối và hạ chữ thường (khớp cách Better Auth lưu email). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Mở rộng IPv6 về đủ 8 nhóm 16 bit (số nguyên). Trả null nếu không hợp lệ. */
function expandIpv6(address: string): number[] | null {
  const [head = '', tail, extra] = address.split('::');
  if (extra !== undefined) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const piece of part.split(':')) {
      if (piece.includes('.')) {
        // đuôi dạng IPv4 nhúng (a.b.c.d) = 2 nhóm
        if (!isIPv4(piece)) return null;
        const [a = 0, b = 0, c = 0, d = 0] = piece.split('.').map(Number);
        groups.push((a << 8) | b, (c << 8) | d);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
        groups.push(Number.parseInt(piece, 16));
      }
    }
    return groups;
  };
  const left = toGroups(head);
  const right = tail === undefined ? [] : toGroups(tail);
  if (left === null || right === null) return null;
  if (tail === undefined) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...new Array<number>(missing).fill(0), ...right];
}

/**
 * Chuẩn hóa IP làm khóa rate limit: chữ thường; `::ffff:a.b.c.d` (IPv4 nhúng trong IPv6) về IPv4; IPv6 gom
 * theo /64 (kẻ tấn công thường có cả khối /64 nên mỗi địa chỉ lẻ không phải một "người" riêng). Không hợp lệ → undefined.
 */
export function normalizeIp(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  value = value.split('%')[0] ?? value; // bỏ zone id của IPv6 link-local
  if (isIPv4(value)) return value;
  if (!isIPv6(value)) return undefined;
  const groups = expandIpv6(value);
  if (!groups) return undefined;
  // ::ffff:a.b.c.d → IPv4
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [g6 = 0, g7 = 0] = groups.slice(6);
    return `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
  }
  return `v6:${groups
    .slice(0, 4)
    .map((g) => g.toString(16).padStart(4, '0'))
    .join(':')}`;
}

/**
 * Khóa Valkey cho một xô: `sys:rl:<hành động>:<xô>:<HMAC-SHA256 của danh tính>`.
 * Tiền tố `sys:` = ngoại lệ nguyên tắc #2 (chưa có workspace lúc đăng nhập — ADR 001/004). Danh tính (email, IP) được
 * băm bằng HMAC với khóa bí mật nên KHÔNG bao giờ nằm thô trong Valkey (nguyên tắc #6) và không dò ngược bằng bảng băm.
 */
export function bucketKey(input: {
  action: string;
  bucket: string;
  identity: string;
  secret: string;
}): string {
  const digest = createHmac('sha256', input.secret)
    .update(`${input.action}\u0000${input.bucket}\u0000${input.identity}`)
    .digest('hex')
    .slice(0, 32);
  return `sys:rl:${input.action}:${input.bucket}:${digest}`;
}
