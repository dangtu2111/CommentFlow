import { describe, expect, it } from 'vitest';
import { READINESS_MIN_PERCENT } from '../gate/auto-send-gate';
import {
  computeReadiness,
  READINESS_REQUIRED_ITEMS,
  READINESS_SAMPLE_QUESTIONS,
  type ReadinessInput,
} from './readiness';

// Fixture: dữ liệu giả lập tối thiểu, không phải dữ liệu khách.
const EMPTY: ReadinessInput = {
  lang: 'vi',
  products: { withPrice: 0, withStock: 0, variantsWithSize: 0, variantsWithColor: 0 },
  shopProfiles: [],
  policies: [],
  faqs: [],
};

const FULL: ReadinessInput = {
  lang: 'vi',
  products: { withPrice: 3, withStock: 3, variantsWithSize: 5, variantsWithColor: 5 },
  shopProfiles: [{ lang: 'vi', contact: '0900', openingHours: '8-17h', address: 'HN' }],
  policies: [
    { kind: 'shipping', lang: 'vi', content: 'ib shop' },
    { kind: 'return', lang: 'vi', content: 'Đổi trong 7 ngày' },
    { kind: 'warranty', lang: 'vi', content: '30 ngày' },
    { kind: 'payment', lang: 'vi', content: 'COD' },
  ],
  faqs: [],
};

describe('FR-146 độ sẵn sàng của AI', () => {
  it('có đúng 20 câu mẫu và 4 mục bắt buộc', () => {
    expect(READINESS_SAMPLE_QUESTIONS).toHaveLength(20);
    expect(READINESS_REQUIRED_ITEMS).toHaveLength(4);
  });

  it('chưa có dữ liệu → 0%, không sẵn sàng, thiếu cả 4 mục', () => {
    const r = computeReadiness(EMPTY);
    expect(r.score).toBe(0);
    expect(r.ready).toBe(false);
    expect(r.requiredDone).toBe(0);
    expect(r.missingRequired).toEqual([...READINESS_REQUIRED_ITEMS]);
  });

  it('đủ dữ liệu (kèm FAQ khuyến mãi) → 100% và sẵn sàng', () => {
    const r = computeReadiness({
      ...FULL,
      faqs: [{ lang: 'vi', question: 'Có khuyến mãi không?', tags: [] }],
    });
    expect(r.samplePassed).toBe(20);
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
    expect(r.missingTopics).toEqual([]);
  });

  it('thiếu một mục bắt buộc → ready=false dù điểm ≥ 80, nêu đúng mục thiếu', () => {
    const r = computeReadiness({
      ...FULL,
      policies: FULL.policies.filter((p) => p.kind !== 'return'),
    });
    expect(r.missingRequired).toEqual(['return_policy']);
    expect(r.score).toBeGreaterThanOrEqual(READINESS_MIN_PERCENT);
    expect(r.ready).toBe(false);
  });

  it('chính sách giao hàng chỉ ghi "ib shop" vẫn tính là có; nội dung trắng thì không', () => {
    const blank = computeReadiness({
      ...FULL,
      policies: [{ kind: 'shipping', lang: 'vi', content: '   ' }],
    });
    expect(blank.missingRequired).toContain('shipping_policy');
    expect(computeReadiness(FULL).missingRequired).not.toContain('shipping_policy');
  });

  it('liên hệ/giờ làm việc: chỉ cần một trong hai', () => {
    const only = (patch: object) =>
      computeReadiness({ ...FULL, shopProfiles: [{ lang: 'vi', ...patch }] }).missingRequired;
    expect(only({ contact: '0900' })).toEqual([]);
    expect(only({ openingHours: '8-17h' })).toEqual([]);
    expect(only({ address: 'HN' })).toEqual(['contact_hours']);
  });

  it('trường mới của thông tin shop (giờ có cấu trúc, kênh Zalo/Shopee/TikTok, địa chỉ chi nhánh) cũng tính', () => {
    const only = (patch: object) =>
      computeReadiness({ ...FULL, shopProfiles: [{ lang: 'vi', ...patch }] });
    expect(only({ hasStructuredHours: true }).missingRequired).toEqual([]);
    expect(only({ hasContactChannel: true }).missingRequired).toEqual([]);
    expect(only({ hasBranchAddress: true }).missingRequired).toEqual(['contact_hours']);
    const topics = (patch: object) => only(patch).missingTopics;
    expect(topics({ hasStructuredHours: true })).not.toContain('hours');
    expect(topics({ hasContactChannel: true })).not.toContain('contact');
    expect(topics({ hasBranchAddress: true })).not.toContain('address');
    expect(topics({})).toEqual(expect.arrayContaining(['hours', 'contact', 'address']));
  });

  it('sản phẩm chưa có giá → thiếu mục sản phẩm có giá và câu hỏi giá không trả lời được', () => {
    const r = computeReadiness({ ...FULL, products: { ...FULL.products, withPrice: 0 } });
    expect(r.missingRequired).toEqual(['product_price']);
    expect(r.missingTopics).toContain('price');
  });

  it('lọc theo ngôn ngữ: mục en không tính cho vi, mục all tính cho cả hai', () => {
    const en = { ...FULL, policies: FULL.policies.map((p) => ({ ...p, lang: 'en' as const })) };
    expect(computeReadiness(en).missingRequired).toEqual(['shipping_policy', 'return_policy']);
    const all = {
      ...FULL,
      shopProfiles: [{ lang: 'all' as const, contact: '0900' }],
      policies: FULL.policies.map((p) => ({ ...p, lang: 'all' as const })),
    };
    expect(computeReadiness({ ...all, lang: 'en' }).missingRequired).toEqual([]);
  });

  it('FAQ phủ chủ đề (theo thẻ hoặc từ khóa không dấu) làm câu mẫu trả lời được, không thay chính sách bắt buộc', () => {
    const base = { ...FULL, policies: [], products: { ...FULL.products, variantsWithSize: 0 } };
    expect(computeReadiness(base).missingTopics).toEqual(
      expect.arrayContaining(['size', 'shipping', 'return', 'warranty', 'payment', 'promo']),
    );
    const withFaq = computeReadiness({
      ...base,
      faqs: [
        { lang: 'vi', question: 'Bảng KÍCH CỠ thế nào?', tags: [] },
        { lang: 'vi', question: 'x', tags: ['ship'] },
        { lang: 'vi', question: 'Chính sách đổi trả?', tags: [] },
        { lang: 'vi', question: 'Bảo hành bao lâu', tags: [] },
        { lang: 'vi', question: 'Thanh toán ra sao', tags: [] },
        { lang: 'vi', question: 'Có khuyến mãi không', tags: [] },
      ],
    });
    expect(withFaq.missingTopics).toEqual([]);
    expect(withFaq.missingRequired).toEqual(['shipping_policy', 'return_policy']);
  });

  it('FAQ khác ngôn ngữ không được tính', () => {
    const r = computeReadiness({
      ...FULL,
      policies: [],
      faqs: [{ lang: 'en', question: 'shipping?', tags: ['ship'] }],
    });
    expect(r.missingTopics).toContain('shipping');
  });

  it('điểm = 40% mục bắt buộc + 60% câu mẫu, làm tròn', () => {
    const r = computeReadiness(FULL);
    expect(r.requiredDone).toBe(4);
    expect(r.samplePassed).toBe(19); // thiếu câu "khuyến mãi" (chỉ FAQ trả lời được)
    expect(r.samplePassRate).toBe(95);
    expect(r.score).toBe(97); // 40 + 0,6 × 95 = 97
    const half = computeReadiness({
      ...EMPTY,
      products: { withPrice: 1, withStock: 1, variantsWithSize: 1, variantsWithColor: 1 },
      shopProfiles: [{ lang: 'vi', contact: 'x' }],
    });
    expect(half.requiredDone).toBe(2);
    expect(half.score).toBeLessThan(READINESS_MIN_PERCENT);
    expect(half.ready).toBe(false);
  });

  it('đủ 4 mục bắt buộc nhưng ít câu mẫu → dưới 80 thì ready=false; đủ thì ready=true', () => {
    const lowCoverage = computeReadiness({
      ...FULL,
      products: { withPrice: 1, withStock: 0, variantsWithSize: 0, variantsWithColor: 0 },
      policies: FULL.policies.filter((p) => ['shipping', 'return'].includes(p.kind)),
    });
    expect(lowCoverage.missingRequired).toEqual([]);
    expect(lowCoverage.score).toBeLessThan(READINESS_MIN_PERCENT);
    expect(lowCoverage.ready).toBe(false);
    expect(computeReadiness(FULL).ready).toBe(true);
  });
});
