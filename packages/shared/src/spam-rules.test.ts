import { describe, expect, it } from 'vitest';
import {
  matchSpamRule,
  PREVIEW_MAX_SAMPLES,
  PREVIEW_WINDOW_DAYS,
  parseSpamRule,
  previewSpamRule,
  type SpamRule,
  type SpamSample,
} from './spam-rules';

const rule = (over: Partial<SpamRule>): SpamRule => ({
  name: 'r',
  type: 'keyword',
  pattern: 'zalo',
  action: 'mark',
  ...over,
});
const c = (text: string, over: Partial<SpamSample> = {}): SpamSample => ({
  id: text,
  text,
  ...over,
});

describe('FR-080 US-050 parseSpamRule (Zod)', () => {
  it('FR-080 nhận quy tắc hợp lệ và cắt khoảng trắng đầu/cuối', () => {
    const r = parseSpamRule({ name: ' Zalo ', type: 'keyword', pattern: ' zalo ', action: 'mark' });
    expect(r.success && r.data).toEqual({
      name: 'Zalo',
      type: 'keyword',
      pattern: 'zalo',
      action: 'mark',
    });
  });

  it('FR-080 US-050 hành động auto_hide bị từ chối (Tự ẩn là việc riêng, AI không tự ẩn)', () => {
    expect(
      parseSpamRule({ name: 'a', type: 'phone', pattern: '', action: 'auto_hide' }).success,
    ).toBe(false);
  });

  it('FR-080 loại lạ, tên rỗng/quá 80, mẫu quá 200 → lỗi', () => {
    expect(parseSpamRule({ name: 'a', type: 'x', pattern: 'a', action: 'mark' }).success).toBe(
      false,
    );
    expect(
      parseSpamRule({ name: ' ', type: 'keyword', pattern: 'a', action: 'mark' }).success,
    ).toBe(false);
    expect(
      parseSpamRule({ name: 'a'.repeat(81), type: 'keyword', pattern: 'a', action: 'mark' })
        .success,
    ).toBe(false);
    expect(
      parseSpamRule({ name: 'a', type: 'keyword', pattern: 'a'.repeat(201), action: 'mark' })
        .success,
    ).toBe(false);
    expect(
      parseSpamRule({ name: 'a', type: 'keyword', pattern: 'a'.repeat(200), action: 'mark' })
        .success,
    ).toBe(true);
  });

  it('FR-080 keyword/regex bắt buộc có mẫu; phone/link/emoji_only/tag_only bỏ mẫu', () => {
    expect(
      parseSpamRule({ name: 'a', type: 'keyword', pattern: ' ', action: 'mark' }).success,
    ).toBe(false);
    const r = parseSpamRule({ name: 'a', type: 'link', pattern: 'bỏ qua', action: 'skip' });
    expect(r.success && r.data.pattern).toBe('');
  });

  it('FR-080 regex không hợp lệ hoặc nguy hiểm (lồng lặp, tham chiếu ngược) bị từ chối', () => {
    for (const pattern of [
      '(',
      '(a+)+$',
      '(.*)*x',
      '(a|aa)+b',
      '(a)\\1',
      // Verifier: các dạng lọt heuristic cũ (lặp lồng bằng {n,}, ngoặc hai lớp, lặp nối tiếp).
      '(a{1,})+',
      '((a+))+',
      '((a|a))+',
      '.*.*.*.*.*.*.*.*x',
      '(?=a+)+b',
    ]) {
      expect(
        parseSpamRule({ name: 'a', type: 'regex', pattern, action: 'mark' }).success,
        pattern,
      ).toBe(false);
    }
    for (const pattern of ['zalo\\s*\\d+', '(zalo|fb)\\s?\\d{3,10}', '^ib\\b.*\\d{9}']) {
      expect(
        parseSpamRule({ name: 'a', type: 'regex', pattern, action: 'mark' }).success,
        pattern,
      ).toBe(true);
    }
  });
});

describe('FR-080 matchSpamRule', () => {
  it('FR-080 keyword: không phân biệt hoa thường/dấu, khớp theo cụm', () => {
    expect(matchSpamRule(rule({ pattern: 'kết bạn zalo' }), c('Ib KET BAN Zalo nhé'))).toBe(true);
    expect(matchSpamRule(rule({ pattern: 'zalo' }), c('mua ngay'))).toBe(false);
  });

  it('FR-080 keyword: nhiều từ khóa ngăn bởi dấu phẩy, chỉ cần khớp một', () => {
    const r = rule({ pattern: 'cá độ, vay tiền' });
    expect(matchSpamRule(r, c('Vay tiền nhanh'))).toBe(true);
    expect(matchSpamRule(r, c('hôm nay mưa'))).toBe(false);
  });

  it('FR-080 regex: khớp không phân biệt hoa thường; văn bản dài bị cắt (không treo)', () => {
    const r = rule({ type: 'regex', pattern: 'zalo\\s*\\d{3}' });
    expect(matchSpamRule(r, c('ZALO 123'))).toBe(true);
    expect(matchSpamRule(r, c(`${'a'.repeat(5000)} zalo 123`))).toBe(false);
  });

  it('FR-080 regex hỏng khi chạy → không khớp, không ném lỗi', () => {
    expect(matchSpamRule(rule({ type: 'regex', pattern: '(' }), c('abc'))).toBe(false);
  });

  it('FR-080 phone: nhận số di động VN các dạng, không nhận số ngắn/giá tiền', () => {
    const r = rule({ type: 'phone', pattern: '' });
    for (const t of ['gọi 0912345678', 'zalo 091 234 5678', 'ib +84 912.345.678', '84912345678']) {
      expect(matchSpamRule(r, c(t)), t).toBe(true);
    }
    for (const t of ['giá 350000', 'còn 12345 cái', 'size 40']) {
      expect(matchSpamRule(r, c(t)), t).toBe(false);
    }
  });

  it('FR-080 link: http(s), www, tên miền trần; không nhận email', () => {
    const r = rule({ type: 'link', pattern: '' });
    for (const t of ['xem https://a.vn/x', 'vào www.shop.com', 'bit.ly/abc123']) {
      expect(matchSpamRule(r, c(t)), t).toBe(true);
    }
    for (const t of ['mail a@b.com', 'giá 3.5 triệu', 'hết hàng.']) {
      expect(matchSpamRule(r, c(t)), t).toBe(false);
    }
  });

  it('FR-080 FR-024 emoji_only / tag_only dùng ruleFilter', () => {
    const e = rule({ type: 'emoji_only', pattern: '' });
    const t = rule({ type: 'tag_only', pattern: '' });
    expect(matchSpamRule(e, c('😍😍'))).toBe(true);
    expect(matchSpamRule(e, c('đẹp quá 😍'))).toBe(false);
    expect(matchSpamRule(e, c('@Lan @Hoa'))).toBe(false);
    expect(matchSpamRule(t, c('@Lan @Hoa'))).toBe(true);
    expect(matchSpamRule(t, c('😍'))).toBe(false);
  });
});

describe('FR-080 US-050 previewSpamRule (7 ngày)', () => {
  it('FR-080 hằng số: cửa sổ 7 ngày, tối đa 5 ví dụ', () => {
    expect(PREVIEW_WINDOW_DAYS).toBe(7);
    expect(PREVIEW_MAX_SAMPLES).toBe(5);
  });

  it('FR-080 đếm khớp/tổng, bỏ bình luận của Page và đã xóa', () => {
    const list = [
      c('zalo 1'),
      c('zalo 2'),
      c('zalo của shop', { isOwn: true }),
      c('zalo đã xóa', { deleted: true }),
      c('bình thường'),
    ];
    const p = previewSpamRule(rule({}), list);
    expect(p.matched).toBe(2);
    expect(p.total).toBe(3);
    expect(p.samples.map((s) => s.id)).toEqual(['zalo 1', 'zalo 2']);
  });

  it('FR-080 ví dụ tối đa 5, che SĐT/email (nguyên tắc #6), nhưng matched đếm đủ', () => {
    const list = Array.from({ length: 8 }, (_, i) =>
      c(`zalo 0912345678 a@b.com #${i}`, { id: `id${i}` }),
    );
    const p = previewSpamRule(rule({}), list);
    expect(p.matched).toBe(8);
    expect(p.samples).toHaveLength(5);
    expect(p.samples[0]?.textMasked).toBe('zalo [sđt] [email] #0');
  });

  it('FR-080 che PII TRƯỚC khi cắt: SĐT nằm vắt qua ký tự 300 không lộ một phần', () => {
    const text = `zalo ${'x'.repeat(285)} 0912345678`;
    const p = previewSpamRule(rule({}), [c(text)]);
    expect(p.samples[0]?.textMasked).not.toMatch(/\d{3}/);
    expect(p.samples[0]?.textMasked.length).toBeLessThanOrEqual(300);
  });

  it('FR-080 rỗng → 0/0', () => {
    expect(previewSpamRule(rule({}), [])).toEqual({ matched: 0, total: 0, samples: [] });
  });
});
