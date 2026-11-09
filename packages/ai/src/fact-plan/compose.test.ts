import { describe, expect, it } from 'vitest';
import { fallbackTemplate, inviteUnknownText, requiredFactIds } from './compose';
import { checkSlotText } from './slots';
import type { Fact, FactPlan } from './types';

const known = (id: string, kind: Fact['kind']): Fact => ({
  id,
  kind,
  status: 'known',
  value: { type: 'text', text: 'x' },
  sourceId: 's',
});
const plan: FactPlan = {
  facts: [
    known('product_name.1', 'product_name'),
    known('variant.1', 'variant'),
    known('price.1', 'price'),
    known('price_range.2', 'price_range'),
    known('stock.1', 'stock'),
    known('ship_fee', 'ship_fee'),
    known('ship_time', 'ship_time'),
    known('cod', 'cod'),
    known('returns', 'returns'),
    known('warranty', 'warranty'),
    known('payment', 'payment'),
    known('customer_measure.1', 'customer_measure'),
    { id: 'price.2', kind: 'price', status: 'unknown' },
  ],
  clarify: null,
  unknownTopics: ['price'],
  issues: [],
};

describe('requiredFactIds — câu trả lời PHẢI dùng các sự kiện đã biết của chủ đề khách hỏi', () => {
  it('lấy mọi sự kiện known trừ tên/biến thể/số khách (chỉ là chất liệu), bỏ unknown', () => {
    expect(requiredFactIds(plan)).toEqual([
      'price.1',
      'price_range.2',
      'stock.1',
      'ship_fee',
      'ship_time',
      'cod',
      'returns',
      'warranty',
      'payment',
    ]);
  });
});

describe('fallbackTemplate — câu do CODE dựng khi mọi bản của LLM bị từ chối', () => {
  it('dùng đúng mã sự kiện, vi và en; không chữ số/khẳng định ngoài chỗ giữ chỗ (tự qua guard)', () => {
    for (const lang of ['vi', 'en'] as const) {
      const text = fallbackTemplate(plan, lang);
      expect(checkSlotText(text, plan)).toEqual({ ok: true, violations: [] });
      for (const id of requiredFactIds(plan)) expect(text).toContain(`{fact:${id}}`);
    }
  });

  it('sự kiện không gắn tên sản phẩm (tên không có trong plan) vẫn dựng được câu', () => {
    const noName: FactPlan = {
      ...plan,
      facts: [known('price.9', 'price'), known('stock.9', 'stock')],
    };
    expect(fallbackTemplate(noName, 'vi')).toBe('Giá {fact:price.9}. Tồn kho: {fact:stock.9}.');
    expect(fallbackTemplate(noName, 'en')).toBe(
      'The price is {fact:price.9}. Availability: {fact:stock.9}.',
    );
  });

  it('không có sự kiện nào cần nói → chuỗi rỗng', () => {
    expect(
      fallbackTemplate({ ...plan, facts: [known('product_name.1', 'product_name')] }, 'vi'),
    ).toBe('');
  });
});

describe('inviteUnknownText — câu mời theo xưng hô cấu hình (mặc định khi shop chưa có mẫu riêng)', () => {
  it('nêu đúng chủ đề chưa có thông tin, xưng hô theo voice, vi và en', () => {
    const vi = inviteUnknownText(['ship_fee', 'ship_time', 'cod'], 'vi', {
      shop: 'em',
      customer: 'anh/chị',
    });
    expect(vi).toBe(
      'Phần phí ship, thời gian giao hàng và thanh toán COD, anh/chị nhắn em để được hỗ trợ nhé.',
    );
    const en = inviteUnknownText(['returns'], 'en', { shop: 'we', customer: 'you' });
    expect(en).toBe('For returns, please message us and we will help.');
    expect(inviteUnknownText([], 'vi', { shop: 'em', customer: 'bạn' })).toBe('');
  });

  it('mọi chủ đề đều có nhãn', () => {
    const topics = [
      'price',
      'stock',
      'ship_fee',
      'ship_time',
      'cod',
      'returns',
      'warranty',
      'payment',
    ] as const;
    for (const topic of topics) {
      expect(inviteUnknownText([topic], 'vi', { shop: 'shop', customer: 'bạn' })).toMatch(
        /^Phần .+, bạn nhắn shop/,
      );
      expect(inviteUnknownText([topic], 'en', { shop: 'the shop', customer: 'you' })).toMatch(
        /^For .+, please message the shop for help\.$/,
      );
    }
  });
});

describe('fallbackTemplate / inviteUnknownText — sự kiện định tính mới', () => {
  const qualitative: FactPlan = {
    facts: [
      known('ship_destination', 'ship_destination'),
      known('refund_to', 'refund_to'),
      known('return_shipping', 'return_shipping'),
      known('return_eligibility', 'return_eligibility'),
    ],
    clarify: null,
    unknownTopics: [],
    issues: [],
  };
  it('mỗi loại có câu dự phòng vi/en chỉ gồm chỗ giữ chỗ + lời văn cố định (qua guard)', () => {
    for (const lang of ['vi', 'en'] as const) {
      const text = fallbackTemplate(qualitative, lang);
      for (const id of ['ship_destination', 'refund_to', 'return_shipping', 'return_eligibility']) {
        expect(text).toContain(`{fact:${id}}`);
      }
      expect(checkSlotText(text, qualitative).ok).toBe(true);
    }
  });
  it('câu mời gọi tên chủ đề mới theo ngôn ngữ', () => {
    const address = { shop: 'we', customer: 'you' };
    const topics = [
      'ship_destination',
      'refund_to',
      'return_shipping',
      'return_eligibility',
      'defect',
    ] as const;
    expect(inviteUnknownText(topics, 'en', address)).toBe(
      'For shipping destinations, refunds, return shipping, return eligibility and defective items, please message us and we will help.',
    );
    expect(inviteUnknownText(['defect'], 'vi', { shop: 'shop', customer: 'bạn' })).toBe(
      'Phần hàng lỗi, bạn nhắn shop để được hỗ trợ nhé.',
    );
  });
});

describe('fallbackTemplate — ghép biến thể khách chọn (giá/tồn đúng biến thể)', () => {
  const withVariant: FactPlan = {
    facts: [
      known('product_name.1', 'product_name'),
      known('variant.1', 'variant'),
      known('price.1', 'price'),
      known('stock.1', 'stock'),
    ],
    clarify: null,
    unknownTopics: [],
    issues: [],
  };
  it('có variant.n → "{tên} ({biến thể}) giá …"; không có thì như cũ', () => {
    expect(fallbackTemplate(withVariant, 'vi')).toBe(
      '{fact:product_name.1} ({fact:variant.1}) giá {fact:price.1}. {fact:product_name.1} ({fact:variant.1}): {fact:stock.1}.',
    );
    expect(fallbackTemplate(withVariant, 'en')).toBe(
      '{fact:product_name.1} ({fact:variant.1}) is {fact:price.1}. {fact:product_name.1} ({fact:variant.1}): {fact:stock.1}.',
    );
    const noVariant = {
      ...withVariant,
      facts: withVariant.facts.filter((f) => f.kind !== 'variant'),
    };
    expect(fallbackTemplate(noVariant, 'vi')).toBe(
      '{fact:product_name.1} giá {fact:price.1}. {fact:product_name.1}: {fact:stock.1}.',
    );
  });
});
