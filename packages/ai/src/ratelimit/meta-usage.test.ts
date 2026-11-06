import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseMetaUsagePercent } from './meta-usage';

describe('FR-114 parseMetaUsagePercent — header mức dùng Meta App', () => {
  it('X-App-Usage: lấy số lớn nhất của call_count/total_cputime/total_time', () => {
    const h = { 'x-app-usage': '{"call_count":28,"total_time":91,"total_cputime":25}' };
    expect(parseMetaUsagePercent(h)).toBe(91);
  });
  it('X-Business-Use-Case-Usage: lấy số lớn nhất mọi id, mọi mục', () => {
    const h = {
      'X-Business-Use-Case-Usage': JSON.stringify({
        '123': [
          {
            type: 'pages',
            call_count: 10,
            total_cputime: 5,
            total_time: 20,
            estimated_time_to_regain_access: 0,
          },
        ],
        '456': [{ type: 'pages', call_count: 77, total_cputime: 1, total_time: 2 }],
      }),
    };
    expect(parseMetaUsagePercent(h)).toBe(77);
  });
  it('gộp cả hai header, tên header không phân biệt hoa/thường', () => {
    const h = {
      'X-APP-USAGE': '{"call_count":40}',
      'x-business-use-case-usage': '{"1":[{"call_count":60}]}',
    };
    expect(parseMetaUsagePercent(h)).toBe(60);
  });
  it('thiếu header / JSON hỏng / không phải số / ngoài 0–100 → null (không bịa thông tin)', () => {
    expect(parseMetaUsagePercent({})).toBeNull();
    expect(parseMetaUsagePercent({ 'x-app-usage': 'not json' })).toBeNull();
    expect(parseMetaUsagePercent({ 'x-app-usage': '{"call_count":"90"}' })).toBeNull();
    expect(parseMetaUsagePercent({ 'x-app-usage': '{"call_count":-5}' })).toBeNull();
    // Meta đang bóp tốc độ có thể báo >100: kẹp về 100 (giảm tốc), không bỏ qua (verifier-security).
    expect(parseMetaUsagePercent({ 'x-app-usage': '{"call_count":150}' })).toBe(100);
    expect(parseMetaUsagePercent({ 'x-app-usage': '[1,2]' })).toBeNull();
  });
  it('một header hỏng: vẫn dùng header đọc được', () => {
    const h = { 'x-app-usage': '{bad', 'x-business-use-case-usage': '{"1":[{"call_count":33}]}' };
    expect(parseMetaUsagePercent(h)).toBe(33);
  });
  it('không bao giờ ném; kết quả null hoặc trong [0,100]', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const r = parseMetaUsagePercent({ 'x-app-usage': a, 'x-business-use-case-usage': b });
        expect(r === null || (r >= 0 && r <= 100)).toBe(true);
      }),
    );
  });
});
