import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShopSections, type ShopSuggestionView } from './shop-sections';

/** Đề xuất của hệ thống hiện dưới đúng ô, có nguồn + trích dẫn, nút Áp dụng/Bỏ gắn vào form riêng bằng thuộc tính `form`. */
const t = (key: string) => key;
const profile = {
  name: 'Shop A',
  website: null,
  description: null,
  address: null,
  openingHours: null,
  contact: null,
  slogan: null,
  industries: [],
  legalName: null,
  taxId: null,
  hours: null,
  contacts: null,
  branches: [],
};
const suggestion = (over: Partial<ShopSuggestionView> & Pick<ShopSuggestionView, 'id' | 'field'>) =>
  ({
    value: 'giá trị',
    evidenceQuote: null,
    source: 'shopify',
    sourceRef: 'shop',
    ...over,
  }) as ShopSuggestionView;

const render = (suggestions: ShopSuggestionView[]) =>
  renderToStaticMarkup(
    <ShopSections profile={profile} suggestions={suggestions} t={t} idPrefix="shop-vi" />,
  );

describe('ShopSections — đề xuất', () => {
  it('không có đề xuất → không có khối đề xuất/nút Áp dụng', () => {
    const html = render([]);
    expect(html).not.toContain('shop.suggest.apply');
  });

  it('đề xuất Shopify: nhãn nguồn, giá trị, nút Áp dụng/Bỏ gắn form `sugg-<id>` với decision applied/rejected', () => {
    const html = render([suggestion({ id: 'abc', field: 'slogan', value: 'Đẹp mỗi ngày' })]);
    expect(html).toContain('shop.suggest.fromShopify');
    expect(html).toContain('Đẹp mỗi ngày');
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    const decisionOf = (value: string) =>
      buttons.find((b) => b.includes('form="sugg-abc"') && b.includes(`value="${value}"`));
    expect(decisionOf('applied')).toContain('name="decision"');
    expect(decisionOf('rejected')).toContain('name="decision"');
  });

  it('đề xuất từ đoạn văn: tiêu đề đoạn và trích dẫn nguyên văn; hotline và email cùng hiện dưới ô Liên hệ', () => {
    const html = render([
      suggestion({
        id: 'h1',
        field: 'hotline',
        value: '0901234567',
        source: 'kb_text',
        sourceRef: 'Giới thiệu',
        evidenceQuote: 'Hotline: 0901234567',
      }),
      suggestion({ id: 'e1', field: 'email', value: 'a@shopa.vn' }),
    ]);
    expect(html).toContain('shop.suggest.fromText');
    expect(html).toContain('“Giới thiệu”');
    expect(html).toContain('“Hotline: 0901234567”');
    expect(html).toContain('a@shopa.vn');
    expect(html).toContain('form="sugg-h1"');
    expect(html).toContain('form="sugg-e1"');
  });

  it('mỗi đề xuất chỉ hiện MỘT lần (dưới đúng ô của trường)', () => {
    const html = render([suggestion({ id: 'z1', field: 'zalo', value: 'https://zalo.me/a' })]);
    expect(html.split('https://zalo.me/a').length - 1).toBe(1);
  });
});
