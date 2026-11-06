import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  crawlDelayFor,
  isAllowedByRobots,
  parseRobots,
  ROBOTS_ALLOW_ALL,
  ROBOTS_DISALLOW_ALL,
} from './robots';

const UA = 'CommentFlowBot';

describe('FR-053 parseRobots + isAllowedByRobots', () => {
  it('robots rỗng/không có quy tắc → cho phép tất cả', () => {
    expect(isAllowedByRobots(parseRobots(''), UA, '/bat-ky')).toBe(true);
    expect(isAllowedByRobots(ROBOTS_ALLOW_ALL, UA, '/')).toBe(true);
  });

  it('chế độ chặn tất cả', () => {
    expect(isAllowedByRobots(ROBOTS_DISALLOW_ALL, UA, '/')).toBe(false);
  });

  it('Disallow theo tiền tố; Disallow rỗng = cho phép', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /admin\nDisallow:\n');
    expect(isAllowedByRobots(rules, UA, '/admin/x')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/chinh-sach')).toBe(true);
  });

  it('nhóm User-agent cụ thể thắng nhóm *', () => {
    const text =
      'User-agent: *\nDisallow: /\n\nUser-agent: commentflowbot\nAllow: /\nDisallow: /private\n';
    const rules = parseRobots(text);
    expect(isAllowedByRobots(rules, UA, '/chinh-sach')).toBe(true);
    expect(isAllowedByRobots(rules, UA, '/private/a')).toBe(false);
    expect(isAllowedByRobots(rules, 'KhacBot', '/chinh-sach')).toBe(false);
  });

  it('nhiều dòng User-agent liên tiếp dùng chung một nhóm', () => {
    const rules = parseRobots('User-agent: a\nUser-agent: commentflowbot\nDisallow: /x\n');
    expect(isAllowedByRobots(rules, UA, '/x')).toBe(false);
  });

  it('khớp dài nhất thắng; hòa thì Allow thắng', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /shop\nAllow: /shop/chinh-sach\nDisallow: /a\nAllow: /a\n',
    );
    expect(isAllowedByRobots(rules, UA, '/shop/gio-hang')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/shop/chinh-sach/doi-tra')).toBe(true);
    expect(isAllowedByRobots(rules, UA, '/a')).toBe(true);
  });

  it('hỗ trợ ký tự * và $, bỏ qua chú thích, khoảng trắng và hoa/thường tên trường', () => {
    const rules = parseRobots(
      '# chú thích\r\nUSER-AGENT: *   # cả bot\r\nDisallow: /*.pdf$\r\nDisallow: /tmp*/cache\r\nBlah: x\r\nkhong co dau hai cham\r\n',
    );
    expect(isAllowedByRobots(rules, UA, '/file.pdf')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/file.pdf?x=1')).toBe(true);
    expect(isAllowedByRobots(rules, UA, '/tmp123/cache')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/tmp123/other')).toBe(true);
  });

  it('$ không có * : khớp chính xác; * cuối mẫu khớp mọi đuôi', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /exact$\nDisallow: /dir*\nDisallow: /a*b$\n',
    );
    expect(isAllowedByRobots(rules, UA, '/exact')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/exact/more')).toBe(true);
    expect(isAllowedByRobots(rules, UA, '/dir/anything')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/aXXb')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/aXXbc')).toBe(true);
    expect(isAllowedByRobots(rules, UA, '/b')).toBe(true);
  });

  it('quy tắc đặt trước User-agent bị bỏ qua', () => {
    expect(isAllowedByRobots(parseRobots('Disallow: /\n'), UA, '/')).toBe(true);
  });

  it('Crawl-delay theo nhóm áp dụng; giá trị sai bị bỏ qua', () => {
    const rules = parseRobots(
      'User-agent: *\nCrawl-delay: 3\n\nUser-agent: commentflowbot\nCrawl-delay: 7.5\n',
    );
    expect(crawlDelayFor(rules, UA)).toBe(7500);
    expect(crawlDelayFor(rules, 'Other')).toBe(3000);
    expect(crawlDelayFor(parseRobots('User-agent: *\nCrawl-delay: abc\n'), UA)).toBeUndefined();
    expect(crawlDelayFor(parseRobots('User-agent: *\nCrawl-delay: -2\n'), UA)).toBeUndefined();
    expect(crawlDelayFor(parseRobots('User-agent: x\nCrawl-delay: 3\n'), UA)).toBeUndefined();
  });

  it('cắt file robots quá lớn nhưng vẫn đọc phần đầu', () => {
    const text = `User-agent: *\nDisallow: /a\n${'# x\n'.repeat(300_000)}Disallow: /b\n`;
    const rules = parseRobots(text);
    expect(isAllowedByRobots(rules, UA, '/a')).toBe(false);
    expect(isAllowedByRobots(rules, UA, '/b')).toBe(true);
  });

  it('property-based: văn bản bất kỳ không ném lỗi; mẫu không có ký tự đặc biệt khớp đúng tiền tố', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, path) => {
        return typeof isAllowedByRobots(parseRobots(text), UA, `/${path}`) === 'boolean';
      }),
    );
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9/-]{1,20}$/),
        fc.stringMatching(/^[a-z0-9/-]{0,20}$/),
        (prefix, tail) => {
          const rules = parseRobots(`User-agent: *\nDisallow: ${prefix}\n`);
          return isAllowedByRobots(rules, UA, prefix + tail) === false;
        },
      ),
    );
  });

  it('ReDoS: mẫu nhiều dấu * không làm chậm', () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /${'*a'.repeat(200)}b\n`);
    const started = Date.now();
    expect(isAllowedByRobots(rules, UA, `/${'a'.repeat(5000)}`)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
