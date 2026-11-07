import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildShopKnowledge, shopFixtureSchema, shopVoice } from './shop';

const shop = shopFixtureSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '../datasets/shops/demo-shop.json'), 'utf8')),
);
const knowledge = buildShopKnowledge(shop);

describe('EVAL-RUNNER cửa hàng mẫu', () => {
  it('fixture hợp lệ và có giọng văn', () => {
    expect(shop.id).toBe('demo-shop');
    expect(shopVoice(shop)).toMatchObject({ shopPronoun: 'shop', customerAddress: 'ban' });
  });

  it('khớp sản phẩm theo tên và theo bí danh tiếng Anh, bỏ dấu, không phân biệt hoa/thường', async () => {
    const byName = await knowledge.matchProducts(['Áo thun basic']);
    const byAlias = await knowledge.matchProducts(['basic T-Shirt']);
    const plain = await knowledge.matchProducts(['ao thun basic']);
    expect(byName.names).toEqual(['Áo thun basic']);
    expect(byAlias.ids).toEqual(byName.ids);
    expect(plain.ids).toEqual(byName.ids);
  });

  it('một sản phẩm nhiều biến thể → hỏi lại size/màu; sản phẩm không biến thể → không hỏi; không có → rỗng', async () => {
    expect((await knowledge.matchProducts(['áo thun basic'])).missingAxes).toEqual([
      'size',
      'color',
    ]);
    expect((await knowledge.matchProducts(['túi tote canvas'])).missingAxes).toEqual([]);
    expect((await knowledge.matchProducts(['váy hoa nhí'])).missingAxes).toEqual([]);
    expect(await knowledge.matchProducts(['ví da bò'])).toEqual({
      ids: [],
      names: [],
      missingAxes: [],
    });
    expect((await knowledge.matchProducts(['x'])).ids).toEqual([]);
  });

  it('nguồn sản phẩm lấy giá/tồn từ dữ liệu (không bịa), id không có thì bỏ qua', async () => {
    const [fact] = await knowledge.lookupProductFacts(['p-ao-thun', 'khong-co']);
    expect(String(fact?.text)).toContain('150.000đ');
    expect(String(fact?.text)).toContain('hết hàng');
    expect(fact).toMatchObject({ kind: 'product', score: 1 });
    expect(await knowledge.lookupProductFacts(['khong-co'])).toEqual([]);
  });

  it('tìm chính sách theo loại và ngôn ngữ', async () => {
    const vi = await knowledge.searchKb('Phí ship về Hà Nội bao nhiêu?', {
      lang: 'vi',
      productIds: [],
    });
    expect(String(vi[0]?.text)).toContain('30.000đ');
    const en = await knowledge.searchKb('What is your return policy', {
      lang: 'en',
      productIds: [],
    });
    expect(String(en[0]?.text)).toContain('7 days');
    expect(await knowledge.searchKb('Bao nhiêu vậy shop?', { lang: 'vi', productIds: [] })).toEqual(
      [],
    );
  });
});
