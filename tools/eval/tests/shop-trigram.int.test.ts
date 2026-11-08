import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildShopKnowledge, shopFixtureSchema } from '../src/shop';
import { createPgTrigramScorer } from '../src/shop-trigram';

/**
 * Nhóm (1) sửa (a) EVAL: bộ khớp sản phẩm của EVAL phải GIỐNG production (`findProductMatch`: pg_trgm `similarity`/`word_similarity`,
 * ngưỡng 0,3/0,4, chọn/mơ hồ `pickProductMatch` 0,45/0,05, bí danh 0,6). Chạy trên DB test thật (chỉ dùng hàm pg_trgm, không ghi bảng).
 */
let pool: pg.Pool;
const load = (name: string) =>
  shopFixtureSchema.parse(
    JSON.parse(readFileSync(resolve(__dirname, '../datasets/shops', name), 'utf8')),
  );
const sswiftly = load('sswiftly.json');
const demo = load('demo-shop.json');

beforeAll(() => {
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL, max: 1 });
});
afterAll(async () => {
  await pool.end();
});

const names = async (shop: typeof sswiftly, mention: string) => {
  const k = buildShopKnowledge(shop, { scorer: createPgTrigramScorer(pool) });
  return (await k.matchProducts([mention])).names;
};
const startsWith = (list: string[], prefix: string) => list.some((n) => n.startsWith(prefix));

describe('bộ khớp sản phẩm của EVAL giống production (pg_trgm thật)', () => {
  it('lời nhắc rút gọn/đảo từ nằm TRONG tên dài của Shopify vẫn khớp (trước đây không khớp vì "tên chứa nguyên văn")', async () => {
    expect(await names(sswiftly, '2 in 1 shower set')).toEqual([
      expect.stringContaining('Handheld Shower Set'),
    ]);
    expect(await names(sswiftly, 'a4 printer')).toEqual([
      expect.stringContaining('A4 Portable Thermal'),
    ]);
    expect(await names(sswiftly, 'wrist massage pads')).toEqual([
      expect.stringContaining('Massage Wrist Pads'),
    ]);
  });

  it('như production: lời nhắc chung chung cho NHIỀU ứng viên sát nhau (mơ hồ) và ứng viên đúng nằm trong đó', async () => {
    const neck = await names(sswiftly, 'neck massager with waist support');
    expect(neck.length).toBeGreaterThan(1);
    expect(startsWith(neck, 'Neck Massager for Trapezius')).toBe(true);
    const litter = await names(sswiftly, 'xxxl litter box');
    expect(litter.length).toBeGreaterThan(1);
    expect(startsWith(litter, 'XXXL Stainless Steel Litter Box')).toBe(true);
  });

  it('tên đầy đủ vẫn khớp đúng một sản phẩm; chuỗi không liên quan KHÔNG khớp', async () => {
    expect(await names(sswiftly, 'Dog Nail Scratch Board')).toEqual([
      expect.stringContaining('Dog Nail Scratch Board'),
    ]);
    expect(await names(sswiftly, 'quantum flux capacitor')).toEqual([]);
  });

  it('bí danh (demo-shop) khớp qua đường bí danh; hỏi mơ hồ ("massage") trả nhiều ứng viên hoặc không chọn bừa', async () => {
    expect(await names(demo, 'basic T-Shirt')).toEqual(['Áo thun basic']);
    const many = await names(sswiftly, 'massage');
    expect(many.length === 0 || many.length > 1).toBe(true);
  });

  it('missingAxes như production: một sản phẩm → trục còn thiếu; nhiều sản phẩm → không chọn trục', async () => {
    const k = buildShopKnowledge(demo, { scorer: createPgTrigramScorer(pool) });
    expect((await k.matchProducts(['áo thun basic'])).missingAxes).toEqual(['size', 'color']);
  });
});
