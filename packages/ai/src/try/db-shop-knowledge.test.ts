import type { TryShopText } from '@flow/db/runtime';
import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { buildDraftMessages } from '../draft/draft-prompt';
import { searchShopTexts, splitPassages } from './db-shop-knowledge';

const items: TryShopText[] = [
  {
    id: '1',
    kind: 'policy',
    policyKind: 'shipping',
    lang: 'vi',
    title: 'Chính sách vận chuyển',
    text: 'Miễn phí vận chuyển đơn từ 500.000đ. Giao hàng toàn quốc trong 3–5 ngày.',
  },
  {
    id: '2',
    kind: 'policy',
    policyKind: 'return',
    lang: 'vi',
    title: 'Chính sách đổi trả',
    text: 'Đổi trả trong 14 ngày nếu sản phẩm lỗi do nhà sản xuất.',
  },
  {
    id: '3',
    kind: 'faq',
    policyKind: null,
    lang: 'vi',
    title: 'Có xuất hóa đơn không?',
    text: 'Có, shop xuất hóa đơn VAT khi khách yêu cầu.',
  },
  {
    id: '4',
    kind: 'policy',
    policyKind: null,
    lang: 'en',
    title: 'Shipping policy',
    text: 'Free shipping over 50 USD.',
  },
];

const ctx = { lang: 'vi' as const };
const first = (hits: { id: string }[]) => hits[0]?.id.split('.')[0];

describe('TRY-AI-REAL lát B — chính sách/FAQ thật', () => {
  it('hỏi ship → ra đúng chính sách vận chuyển của shop, không phải mục khác', () => {
    const hits = searchShopTexts(items, 'Phí ship về Hà Nội bao nhiêu?', ctx);
    expect(first(hits)).toBe('policy:1');
    expect(hits.some((h) => h.id.startsWith('policy:2'))).toBe(false);
  });

  it('hỏi đổi trả → ra chính sách đổi trả', () => {
    expect(first(searchShopTexts(items, 'Bên mình đổi trả thế nào?', ctx))).toBe('policy:2');
  });

  it('câu chung chung ("Bao nhiêu vậy shop?") KHÔNG kéo mục không liên quan', () => {
    expect(searchShopTexts(items, 'Bao nhiêu vậy shop?', ctx)).toEqual([]);
  });

  it('FAQ khớp từ khóa của câu hỏi', () => {
    expect(first(searchShopTexts(items, 'shop có xuất hóa đơn VAT không', ctx))).toBe('faq:3');
  });

  it('chỉ trả mục đúng ngôn ngữ; không có mục nào → rỗng (không bịa)', () => {
    expect(first(searchShopTexts(items, 'shipping policy', { lang: 'en' }))).toBe('policy:4');
    expect(searchShopTexts([], 'phí ship', ctx)).toEqual([]);
  });

  it('điểm do code tính, trong (0,1)', () => {
    for (const hit of searchShopTexts(items, 'Phí ship giao hàng toàn quốc', ctx)) {
      expect(hit.score).toBeGreaterThan(0);
      expect(hit.score).toBeLessThan(1);
    }
  });

  it('chính sách nạp từ Shopify (lang "all", nội dung tiếng Anh) trả lời câu hỏi tiếng Việt theo loại', () => {
    const shopify: TryShopText[] = [
      {
        id: 's',
        kind: 'policy',
        policyKind: 'shipping',
        lang: 'all',
        title: 'Shipping',
        text: 'Orders ship within 3 days.',
      },
      {
        id: 'r',
        kind: 'policy',
        policyKind: 'return',
        lang: 'all',
        title: 'Refund policy',
        text: 'Returns accepted within 30 days.',
      },
      {
        id: 'p',
        kind: 'policy',
        policyKind: 'other',
        lang: 'all',
        title: 'Privacy policy',
        text: 'We collect your data.',
      },
    ];
    const ids = (q: string) => searchShopTexts(shopify, q, ctx).map((h) => h.id.split('.')[0]);
    expect(ids('Phí ship về Hà Nội bao nhiêu?')).toEqual(['policy:s']);
    expect(ids('Bên mình đổi trả thế nào?')).toEqual(['policy:r']);
    expect(ids('Bao nhiêu vậy shop?')).toEqual([]);
  });

  it('chính sách dài được cắt đoạn: chỉ lấy đoạn liên quan, không dán cả bài', () => {
    const filler = Array.from({ length: 30 }, (_, i) =>
      `Mục ${i}: nội dung không liên quan số ${i}. `.repeat(6),
    ).join('\n');
    const text = `${filler}\nShipping rates: orders ship in 3 days, delivery fee is flat.`;
    const doc: TryShopText[] = [
      { id: 'L', kind: 'policy', policyKind: 'shipping', lang: 'all', title: 'Shipping', text },
    ];
    const hits = searchShopTexts(doc, 'Phí ship bao nhiêu?', ctx);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (const hit of hits) expect(hit.text.length).toBeLessThan(1200);
    expect(hits.some((hit) => hit.text.includes('delivery fee'))).toBe(true);
    expect(splitPassages(text).every((passage) => passage.length < 1200)).toBe(true);
  });

  it('mục loại khác (quyền riêng tư) không bị kéo ra khi hỏi ship dù nhắc tới giao hàng', () => {
    const doc: TryShopText[] = [
      {
        id: 'P',
        kind: 'policy',
        policyKind: 'other',
        lang: 'all',
        title: 'Privacy policy',
        text: 'We share data with delivery and shipping partners.',
      },
    ];
    expect(searchShopTexts(doc, 'Phí ship về Hà Nội bao nhiêu?', ctx)).toEqual([]);
  });
});

describe('mã nguồn hợp lệ với bước soạn (draft-prompt SOURCE_ID)', () => {
  it('mọi đoạn tìm được đi qua buildDraftMessages không bị từ chối', () => {
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    const doc: TryShopText[] = [
      {
        id: uuid,
        kind: 'policy',
        policyKind: 'shipping',
        lang: 'all',
        title: 'Shipping',
        text: 'Orders ship in 3 days.',
      },
      {
        id: uuid,
        kind: 'faq',
        policyKind: null,
        lang: 'vi',
        title: 'Ship bao lâu?',
        text: 'Giao hàng 2–4 ngày ship nhanh.',
      },
    ];
    const hits = searchShopTexts(doc, 'Phí ship bao nhiêu? ship bao lâu', ctx);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.id).toMatch(/^[A-Za-z0-9_:.-]{1,64}$/);
    }
    expect(() =>
      buildDraftMessages({
        workspaceId: '00000000-0000-4000-8000-000000000001',
        question: unsafeMarkMasked('Phí ship bao nhiêu?'),
        lang: 'vi',
        kbVersion: 'v1',
        voice: { do: [], dont: [], shopPronoun: 'shop', customerAddress: 'ban' },
        sources: hits.map((hit) => ({
          id: hit.id,
          kind: hit.kind,
          text: hit.text,
          relevance: hit.score,
        })),
      }),
    ).not.toThrow();
  });
});
