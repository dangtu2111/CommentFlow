import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UrlCrawlError } from './errors';
import { assertPublicAddresses, isBlockedIp, parseCrawlUrl } from './ssrf';

function reasonOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof UrlCrawlError ? error.reason : 'khong-phai-UrlCrawlError';
  }
  return undefined;
}

describe('FR-053 parseCrawlUrl — chống SSRF ở tầng URL', () => {
  it('nhận http/https công khai và bỏ fragment', () => {
    expect(parseCrawlUrl('https://shop.example.vn/chinh-sach#doi-tra').href).toBe(
      'https://shop.example.vn/chinh-sach',
    );
    expect(parseCrawlUrl(' http://shop.example.vn:80/a ').hostname).toBe('shop.example.vn');
    expect(parseCrawlUrl('https://shop.example.vn:443/').port).toBe('');
  });

  it('từ chối chuỗi không phải URL', () => {
    expect(reasonOf(() => parseCrawlUrl('không phải url'))).toBe('INVALID_URL');
    expect(reasonOf(() => parseCrawlUrl(''))).toBe('INVALID_URL');
  });

  it.each([
    'ftp://shop.example.vn/a',
    'file:///etc/passwd',
    'gopher://x.example.vn',
    'javascript:alert(1)',
  ])('từ chối scheme %s', (url) => {
    expect(reasonOf(() => parseCrawlUrl(url))).toBe('SCHEME_NOT_ALLOWED');
  });

  it('từ chối thông tin đăng nhập trong URL', () => {
    expect(reasonOf(() => parseCrawlUrl('https://user:pw@shop.example.vn/'))).toBe('INVALID_URL');
    expect(reasonOf(() => parseCrawlUrl('https://user@shop.example.vn/'))).toBe('INVALID_URL');
  });

  it('chỉ cho cổng 80/443', () => {
    expect(reasonOf(() => parseCrawlUrl('http://shop.example.vn:8080/'))).toBe('PORT_NOT_ALLOWED');
    expect(reasonOf(() => parseCrawlUrl('https://shop.example.vn:22/'))).toBe('PORT_NOT_ALLOWED');
    expect(reasonOf(() => parseCrawlUrl('https://shop.example.vn:443/'))).toBeUndefined();
    expect(reasonOf(() => parseCrawlUrl('http://shop.example.vn:443/'))).toBeUndefined();
  });

  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://printer.local/',
    'http://db.internal/',
    'http://intranet/',
    'http://metadata.google.internal/',
  ])('chặn tên máy nội bộ %s', (url) => {
    expect(reasonOf(() => parseCrawlUrl(url))).toBe('HOST_BLOCKED');
  });

  it.each([
    'http://127.0.0.1/',
    'http://2130706433/', // thập phân của 127.0.0.1
    'http://0x7f000001/', // hex
    'http://0177.0.0.1/', // bát phân
    'http://127.1/', // rút gọn
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fd00::1]/',
    'http://0.0.0.0/',
  ])('chặn IP nội bộ viết dưới mọi dạng %s', (url) => {
    expect(reasonOf(() => parseCrawlUrl(url))).toBe('HOST_BLOCKED');
  });

  it('cho IP công cộng viết thẳng vào URL qua bước đầu (bước DNS vẫn kiểm lại)', () => {
    expect(reasonOf(() => parseCrawlUrl('http://93.184.216.34/'))).toBeUndefined();
    expect(reasonOf(() => parseCrawlUrl('http://[2606:4700:4700::1111]/'))).toBeUndefined();
  });

  it('URL quá dài bị từ chối', () => {
    expect(reasonOf(() => parseCrawlUrl(`https://shop.example.vn/${'a'.repeat(3000)}`))).toBe(
      'INVALID_URL',
    );
  });
});

describe('FR-053 isBlockedIp', () => {
  it.each([
    '0.0.0.0',
    '0.255.255.255',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fdff:ffff::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe', // 169.254.169.254 dạng IPv4-mapped
    '64:ff9b::7f00:1', // NAT64 trỏ vào 127.0.0.1
    '64:ff9b::a00:1',
    '2002:7f00:1::', // 6to4 chứa 127.0.0.1
    '2002:a00:1::',
    '::7f00:1', // IPv4-compatible
    'khong-phai-ip',
    '',
    '999.1.1.1',
    '1.2.3',
    '1:2:3:4:5:6:7:8:9',
    '1::2::3',
    'fec0::1',
    'feff::1',
    '64:ff9b:1::a9fe:a9fe', // NAT64 nội bộ → metadata
    '::ffff:0:7f00:1', // SIIT chứa 127.0.0.1
    '::ffff:0:10.0.0.1',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7::8:9',
    '1.2.3.4.5',
    '::1.2.3',
    '::g',
  ])('chặn %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '100.63.255.255',
    '100.128.0.0',
    '126.255.255.255',
    '128.0.0.1',
    '172.15.255.255',
    '172.32.0.0',
    '192.0.1.1',
    '192.167.255.255',
    '192.169.0.0',
    '198.17.255.255',
    '198.20.0.0',
    '223.255.255.255',
    '2606:4700:4700::1111',
    '2a00:1450:4001:81b::200e',
    '::ffff:93.184.216.34',
    '::ffff:0:5db8:d822', // SIIT chứa IP công cộng
    '::ffff:5db8:d822',
    '64:ff9b::5db8:d822',
    '2002:5db8:d822::',
  ])('cho qua IP công cộng %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it('property-based: mọi IPv4 trong dải riêng đều bị chặn, kể cả dạng IPv4-mapped', () => {
    const octet = fc.integer({ min: 0, max: 255 });
    const privateIp = fc.oneof(
      fc.tuple(fc.constant(10), octet, octet, octet),
      fc.tuple(fc.constant(127), octet, octet, octet),
      fc.tuple(fc.constant(169), fc.constant(254), octet, octet),
      fc.tuple(fc.constant(192), fc.constant(168), octet, octet),
      fc.tuple(fc.constant(172), fc.integer({ min: 16, max: 31 }), octet, octet),
      fc.tuple(fc.constant(100), fc.integer({ min: 64, max: 127 }), octet, octet),
      fc.tuple(fc.integer({ min: 224, max: 255 }), octet, octet, octet),
      fc.tuple(fc.constant(0), octet, octet, octet),
    );
    fc.assert(
      fc.property(privateIp, ([a, b, c, d]) => {
        const v4 = `${a}.${b}.${c}.${d}`;
        const hex = (n: number) => n.toString(16).padStart(2, '0');
        const mapped = `::ffff:${hex(a)}${hex(b)}:${hex(c)}${hex(d)}`;
        return isBlockedIp(v4) && isBlockedIp(mapped) && isBlockedIp(`::ffff:${v4}`);
      }),
    );
  });

  it('property-based: IPv4 dạng IPv4-mapped cho cùng kết quả với dạng thường; không bao giờ ném lỗi', () => {
    const octet = fc.integer({ min: 0, max: 255 });
    fc.assert(
      fc.property(octet, octet, octet, octet, (a, b, c, d) => {
        const v4 = `${a}.${b}.${c}.${d}`;
        return isBlockedIp(v4) === isBlockedIp(`::ffff:${v4}`);
      }),
    );
    fc.assert(fc.property(fc.string(), (s) => typeof isBlockedIp(s) === 'boolean'));
  });
});

describe('FR-053 assertPublicAddresses', () => {
  it('chấp nhận khi mọi địa chỉ đều công cộng', () => {
    expect(() => assertPublicAddresses(['93.184.216.34', '2606:4700:4700::1111'])).not.toThrow();
  });

  it('từ chối khi BẤT KỲ địa chỉ nào bị chặn (chống DNS trả lẫn IP nội bộ)', () => {
    expect(reasonOf(() => assertPublicAddresses(['93.184.216.34', '127.0.0.1']))).toBe(
      'HOST_BLOCKED',
    );
  });

  it('danh sách rỗng → DNS_FAILED', () => {
    expect(reasonOf(() => assertPublicAddresses([]))).toBe('DNS_FAILED');
  });
});
