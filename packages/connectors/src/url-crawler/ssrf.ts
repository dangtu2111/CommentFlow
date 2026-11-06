import { UrlCrawlError } from './errors';

const MAX_URL_LENGTH = 2048;
const ALLOWED_PORTS = new Set(['', '80', '443']);

/** Tên máy nội bộ/đặc biệt: một nhãn (không dấu chấm) hoặc đuôi dành riêng. */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  if (!host.includes('.')) return true;
  return ['localhost', 'local', 'internal', 'localdomain', 'home.arpa'].some(
    (tld) => host === tld || host.endsWith(`.${tld}`),
  );
}

/** Dạng chữ số `a.b.c.d` (đã chuẩn hóa bởi WHATWG URL); sai dạng → undefined. */
function parseIpv4(text: string): number[] | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) return undefined;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const value = Number(part);
    if (value > 255) return undefined;
    bytes.push(value);
  }
  return bytes;
}

/** IPv6 → 16 byte (hỗ trợ `::` và đuôi IPv4); sai dạng → undefined. */
function parseIpv6(text: string): number[] | undefined {
  let source = text;
  const lastColon = source.lastIndexOf(':');
  const tail = source.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return undefined;
    const hex = (a: number, b: number) => ((a << 8) | b).toString(16);
    source = `${source.slice(0, lastColon + 1)}${hex(v4[0]!, v4[1]!)}:${hex(v4[2]!, v4[3]!)}`;
  }
  const halves = source.split('::');
  if (halves.length > 2) return undefined;
  const toGroups = (part: string) => (part === '' ? [] : part.split(':'));
  const head = toGroups(halves[0]!);
  const rest = halves.length === 2 ? toGroups(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return undefined;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function isBlockedIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local + metadata đám mây
  if (a === 172 && b! >= 16 && b! <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a! >= 224; // multicast + dành riêng + broadcast
}

function isBlockedIpv6(bytes: number[]): boolean {
  const first12Zero = bytes.slice(0, 12).every((byte) => byte === 0);
  if (first12Zero) return true; // ::, ::1, IPv4-compatible
  const isMapped =
    bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isMapped) return isBlockedIpv4(bytes.slice(12));
  const isNat64 = bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b;
  if (isNat64 && bytes.slice(4, 12).every((byte) => byte === 0))
    return isBlockedIpv4(bytes.slice(12));
  const isNat64Local =
    bytes[0] === 0 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0 &&
    bytes[5] === 1;
  if (isNat64Local) return true; // 64:ff9b:1::/48 (RFC 8215): NAT64 nội bộ
  const isSiit =
    bytes.slice(0, 8).every((byte) => byte === 0) &&
    bytes[8] === 0xff &&
    bytes[9] === 0xff &&
    bytes[10] === 0 &&
    bytes[11] === 0;
  if (isSiit) return isBlockedIpv4(bytes.slice(12)); // ::ffff:0:a.b.c.d
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0) return true; // fec0::/10 site-local (đã bỏ nhưng vẫn có nơi định tuyến)
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isBlockedIpv4(bytes.slice(2, 6)); // 6to4
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // tài liệu
  if ((bytes[0]! & 0xfe) === 0xfc) return true; // ULA fc00::/7
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true; // link-local
  return bytes[0] === 0xff; // multicast
}

/** Địa chỉ không phải IP công cộng định tuyến được (hoặc không đọc được → coi là chặn, an toàn). */
export function isBlockedIp(ip: string): boolean {
  if (ip.includes(':')) {
    const bytes = parseIpv6(ip);
    return bytes === undefined || isBlockedIpv6(bytes);
  }
  const bytes = parseIpv4(ip);
  return bytes === undefined || isBlockedIpv4(bytes);
}

/** Kiểm URL người dùng dán: chỉ http/https, cổng mặc định, không đăng nhập, không máy nội bộ/IP nội bộ. */
export function parseCrawlUrl(raw: string): URL {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_URL_LENGTH) throw new UrlCrawlError('INVALID_URL');
  let url: URL;
  try {
    url = new URL(text);
  } catch (cause) {
    throw new UrlCrawlError('INVALID_URL', { cause });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UrlCrawlError('SCHEME_NOT_ALLOWED');
  if (url.username !== '' || url.password !== '') throw new UrlCrawlError('INVALID_URL');
  if (!ALLOWED_PORTS.has(url.port)) throw new UrlCrawlError('PORT_NOT_ALLOWED');
  url.hash = '';
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const isLiteralIp = url.hostname.startsWith('[') || parseIpv4(host) !== undefined;
  if (isLiteralIp ? isBlockedIp(host) : isBlockedHostname(host))
    throw new UrlCrawlError('HOST_BLOCKED');
  return url;
}

/** Mọi địa chỉ DNS trả về phải công cộng; chỉ cần một địa chỉ nội bộ là từ chối (chống DNS trả lẫn). */
export function assertPublicAddresses(addresses: readonly string[]): void {
  if (addresses.length === 0) throw new UrlCrawlError('DNS_FAILED');
  if (addresses.some(isBlockedIp)) throw new UrlCrawlError('HOST_BLOCKED');
}
