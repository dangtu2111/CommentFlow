import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  guardVariants,
  MAX_VARIANTS,
  pickVariant,
  REASON_VARIANTS_EXHAUSTED,
  replyFingerprint,
} from './variation';

const SOURCES = [
  'Áo thun basic giá 150.000đ, freeship đơn từ 300.000đ. Xem thêm tại https://shop.vn/ao-thun',
];
const BASE = 'Áo thun basic giá 150.000đ nha bạn, xem thêm tại https://shop.vn/ao-thun';

describe('FR-161 replyFingerprint', () => {
  it('bỏ hoa/thường, dấu câu, khoảng trắng nhưng giữ chữ và số', () => {
    expect(replyFingerprint('Giá 150.000đ!')).toBe(replyFingerprint('  giá   150000Đ '));
    expect(replyFingerprint('Giá 150.000đ')).not.toBe(replyFingerprint('Giá 160.000đ'));
  });

  it('lũy đẳng theo chuẩn hóa: cùng chuỗi → cùng dấu vết, định dạng hex 64', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(replyFingerprint(text)).toBe(replyFingerprint(text));
        expect(replyFingerprint(text)).toMatch(/^[0-9a-f]{64}$/);
      }),
    );
  });
});

describe('FR-161 guardVariants', () => {
  it('giữ câu gốc đầu tiên và các biến thể đúng nội dung', () => {
    const r = guardVariants({
      reply: BASE,
      variants: [
        'Dạ áo thun basic đang giá 150.000đ, bạn xem tại https://shop.vn/ao-thun nhé',
        'Bạn ơi, áo thun basic giá 150.000đ; chi tiết ở https://shop.vn/ao-thun ạ',
      ],
      sources: SOURCES,
    });
    expect(r.variants).toHaveLength(3);
    expect(r.variants[0]).toBe(BASE);
    expect(r.rejected).toBe(0);
  });

  it('loại biến thể đổi số tiền', () => {
    const r = guardVariants({
      reply: BASE,
      variants: ['Áo thun basic giá 120.000đ, xem https://shop.vn/ao-thun'],
      sources: SOURCES,
    });
    expect(r.variants).toEqual([BASE]);
    expect(r.rejected).toBe(1);
  });

  it('loại biến thể bớt link hoặc bớt giá so với câu gốc (dù không bịa)', () => {
    const r = guardVariants({
      reply: BASE,
      variants: ['Áo thun basic giá 150.000đ nhé bạn', 'Xem áo tại https://shop.vn/ao-thun nhé'],
      sources: SOURCES,
    });
    expect(r.variants).toEqual([BASE]);
    expect(r.rejected).toBe(2);
  });

  it('loại biến thể thêm khẳng định mới dù có trong nguồn (freeship 300.000đ)', () => {
    const r = guardVariants({
      reply: BASE,
      variants: ['Áo thun basic giá 150.000đ, freeship từ 300.000đ, xem https://shop.vn/ao-thun'],
      sources: SOURCES,
    });
    expect(r.variants).toEqual([BASE]);
    expect(r.rejected).toBe(1);
  });

  it('loại biến thể có link/SĐT lạ không có trong nguồn', () => {
    const r = guardVariants({
      reply: BASE,
      variants: ['Áo thun basic giá 150.000đ, https://shop.vn/ao-thun, gọi 0912345678'],
      sources: SOURCES,
    });
    expect(r.variants).toEqual([BASE]);
  });

  it('loại biến thể rỗng, trùng câu gốc (khác hoa/thường/dấu câu) và trùng nhau', () => {
    const alt = 'Dạ áo thun basic giá 150.000đ, xem https://shop.vn/ao-thun nha';
    const r = guardVariants({
      reply: BASE,
      variants: ['', '   ', BASE.toUpperCase(), alt, `${alt}!!`],
      sources: SOURCES,
    });
    expect(r.variants).toEqual([BASE, alt]);
    expect(r.rejected).toBe(4);
  });

  it('tối đa MAX_VARIANTS gồm cả câu gốc', () => {
    const many = Array.from(
      { length: 10 },
      (_, i) => `Cách ${i} áo thun basic giá 150.000đ https://shop.vn/ao-thun`,
    );
    const r = guardVariants({ reply: BASE, variants: many, sources: SOURCES });
    expect(r.variants).toHaveLength(MAX_VARIANTS);
    expect(MAX_VARIANTS).toBe(5);
  });

  it('câu gốc rỗng → không có biến thể', () => {
    expect(guardVariants({ reply: '', variants: ['x'], sources: SOURCES })).toEqual({
      variants: [],
      rejected: 1,
    });
  });

  it('property: mọi biến thể giữ lại có đúng tập khẳng định số tiền của câu gốc', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 999 }), { maxLength: 6 }), (amounts) => {
        const variants = amounts.map(
          (n) => `Áo giá ${n}.000đ nhé bạn, xem https://shop.vn/ao-thun`,
        );
        const r = guardVariants({ reply: BASE, variants, sources: SOURCES });
        // Nguồn chỉ có 150.000đ/300.000đ → chỉ biến thể 150.000đ có thể sống sót… nhưng thiếu "thun basic"
        for (const v of r.variants.slice(1)) expect(v).toContain('150.000đ');
      }),
    );
  });
});

describe('FR-161 pickVariant', () => {
  const variants = ['Câu một', 'Câu hai', 'Câu ba'];

  it('không trả biến thể đã dùng dưới bài trong 1 giờ', () => {
    const used = new Set([replyFingerprint('Câu một'), replyFingerprint('Câu ba')]);
    const picked = pickVariant(variants, used, () => 0);
    expect(picked).toEqual({
      index: 1,
      text: 'Câu hai',
      fingerprint: replyFingerprint('Câu hai'),
    });
  });

  it('hết biến thể chưa dùng → null (chuyển Chờ duyệt)', () => {
    const used = new Set(variants.map(replyFingerprint));
    expect(pickVariant(variants, used, () => 0)).toBeNull();
    expect(pickVariant([], new Set(), () => 0)).toBeNull();
    expect(REASON_VARIANTS_EXHAUSTED).toBe('Hết biến thể chưa dùng trong 1 giờ');
  });

  it('chọn theo random tiêm vào, biên 0 và gần 1', () => {
    expect(pickVariant(variants, new Set(), () => 0)?.index).toBe(0);
    expect(pickVariant(variants, new Set(), () => 0.999)?.index).toBe(2);
    expect(pickVariant(variants, new Set(), () => 1)?.index).toBe(2);
  });

  it('nguồn ngẫu nhiên trả NaN vẫn chọn được biến thể chưa dùng (hồi quy CI)', () => {
    expect(pickVariant(variants, new Set(), () => Number.NaN)?.index).toBe(0);
  });

  it('property: kết quả luôn thuộc tập chưa dùng', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (flags, r) => {
          const used = new Set(variants.filter((_, i) => flags[i]).map(replyFingerprint));
          const picked = pickVariant(variants, used, () => r);
          if (picked) expect(used.has(picked.fingerprint)).toBe(false);
          else expect(used.size).toBe(3);
        },
      ),
    );
  });
});
