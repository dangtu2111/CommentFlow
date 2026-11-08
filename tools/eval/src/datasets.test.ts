import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANG_GROUPS, parseDataset } from './dataset';
import { parseRetrievalGold } from './retrieval-metrics';
import { buildShopKnowledge, shopFixtureSchema } from './shop';

/**
 * Mọi bộ mẫu `.jsonl` trong `datasets/` PHẢI đúng schema EVAL-RUNNER (id duy nhất, nhóm ngôn ngữ, đáp án đủ), và mọi cửa hàng mẫu `.json` đúng
 * schema cửa hàng. Bắt lỗi định dạng khi thêm bộ mới (vd. synthetic v2) trước khi chạy tốn token.
 */
const DIR = resolve(__dirname, '../datasets');
const sets = readdirSync(DIR).filter((f) => f.endsWith('.jsonl'));
const shops = readdirSync(resolve(DIR, 'shops')).filter((f) => f.endsWith('.json'));

describe('bộ mẫu trong datasets/', () => {
  it('có các bộ synthetic v2 đã đặt', () => {
    expect(sets).toEqual(
      expect.arrayContaining(['synthetic-v2-demo-shop.jsonl', 'synthetic-v2-sswiftly-en.jsonl']),
    );
  });

  for (const file of sets) {
    it(`${file}: đúng schema, id duy nhất, nhóm ngôn ngữ hợp lệ`, () => {
      const samples = parseDataset(readFileSync(resolve(DIR, file), 'utf8'));
      expect(samples.length).toBeGreaterThan(0);
      for (const s of samples) expect(LANG_GROUPS).toContain(s.group);
    });
  }

  it('synthetic v2: 99 mẫu (vi/vi_plain/mixed; gồm 5 mẫu "admin/hệ thống" KHÔNG phải chèn lệnh) và 32 mẫu (en), đều `synthetic`', () => {
    const demo = parseDataset(readFileSync(resolve(DIR, 'synthetic-v2-demo-shop.jsonl'), 'utf8'));
    const en = parseDataset(readFileSync(resolve(DIR, 'synthetic-v2-sswiftly-en.jsonl'), 'utf8'));
    expect(demo).toHaveLength(99);
    expect(new Set(demo.map((s) => s.group))).toEqual(new Set(['vi', 'vi_plain', 'mixed']));
    expect(en).toHaveLength(32);
    expect(new Set(en.map((s) => s.group))).toEqual(new Set(['en']));
    expect([...demo, ...en].every((s) => s.source === 'synthetic')).toBe(true);
  });
});

describe('cửa hàng mẫu trong datasets/shops/', () => {
  for (const file of shops) {
    it(`${file}: đúng schema cửa hàng`, () => {
      const shop = shopFixtureSchema.parse(
        JSON.parse(readFileSync(resolve(DIR, 'shops', file), 'utf8')),
      );
      expect(shop.products.length).toBeGreaterThan(0);
    });
  }

  it('sswiftly (USD): giá ở đơn vị nhỏ nhất, câu nguồn nêu đúng tiền tệ gốc, không quy đổi VND', async () => {
    const shop = shopFixtureSchema.parse(
      JSON.parse(readFileSync(resolve(DIR, 'shops', 'sswiftly.json'), 'utf8')),
    );
    expect(shop.products.every((p) => p.currencyCode === 'USD' && p.priceVnd === null)).toBe(true);
    const k = buildShopKnowledge(shop);
    const m = await k.matchProducts(['Dog Nail Scratch Board']);
    expect(m.ids).toHaveLength(1);
    const [fact] = await k.lookupProductFacts(m.ids);
    expect(String(fact?.text)).toContain('58.90 USD');
  });
});

describe('gán đoạn đúng cho bộ đo truy hồi (Nhóm R)', () => {
  const cases = [
    ['demo-shop.jsonl', 'synthetic-v2-demo-shop.jsonl', 'demo-shop.json'],
    ['sswiftly.jsonl', 'synthetic-v2-sswiftly-en.jsonl', 'sswiftly.json'],
  ] as const;
  for (const [goldFile, datasetFile, shopFile] of cases) {
    it(`${goldFile}: mọi mã mẫu có trong bộ mẫu, mọi mã mục kiến thức có trong cửa hàng`, () => {
      const gold = parseRetrievalGold(readFileSync(resolve(DIR, 'retrieval', goldFile), 'utf8'));
      const samples = new Set(
        parseDataset(readFileSync(resolve(DIR, datasetFile), 'utf8')).map((s) => s.id),
      );
      const shop = shopFixtureSchema.parse(
        JSON.parse(readFileSync(resolve(DIR, 'shops', shopFile), 'utf8')),
      );
      const items = new Set([...shop.texts.map((t) => t.id), ...shop.products.map((p) => p.id)]);
      expect(gold.size).toBeGreaterThan(0);
      for (const [id, wanted] of gold) {
        expect(samples.has(id), `mẫu ${id} không có trong ${datasetFile}`).toBe(true);
        for (const item of wanted) {
          expect(items.has(item), `mục ${item} (mẫu ${id}) không có trong ${shopFile}`).toBe(true);
        }
      }
    });
  }
});
