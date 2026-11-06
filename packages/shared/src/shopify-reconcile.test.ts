import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ImportProductPlan } from './product-import/plan';
import {
  canRunManualReconcile,
  checkWebhookTopics,
  type InternalProductSnapshot,
  RECONCILE_ADMIN_RATIO,
  reconcileCatalog,
  SHOPIFY_REQUIRED_WEBHOOK_TOPICS,
} from './shopify-reconcile';

const variant = (id: string, over: Partial<ImportProductPlan['variants'][number]> = {}) => ({
  externalId: id,
  sku: null,
  attrs: {},
  attrsNorm: {},
  priceVnd: 100_000 as number | null,
  compareAtVnd: null as number | null,
  stock: 5 as number | null,
  ...over,
});
const shop = (id: string, variants = [variant(`${id}/v1`)], name = `Áo ${id}`) =>
  ({
    externalId: id,
    name,
    category: null,
    url: null,
    searchText: name,
    priceVnd: 100_000,
    compareAtVnd: null,
    stock: 5,
    variantsSnapshot: [],
    variants,
  }) as ImportProductPlan;
const internal = (
  id: string,
  variants = [{ externalId: `${id}/v1`, priceVnd: 100_000, compareAtVnd: null, stock: 5 }],
  name = `Áo ${id}`,
): InternalProductSnapshot => ({ externalId: id, name, variants });

describe('reconcileCatalog (FR-112)', () => {
  it('giống nhau → không lệch, không cảnh báo', () => {
    const r = reconcileCatalog([shop('p1')], [internal('p1')]);
    expect(r.diffs).toEqual([]);
    expect(r.summary).toMatchObject({ productsChecked: 1, variantsChecked: 1, diffs: 0 });
    expect(r.alerts).toEqual({ notifyOwner: false, alertAdmin: false, diffRatioHigh: false });
    expect(r.needsOwnerReview).toBe(false);
  });

  it('lệch giá, giá so sánh, tồn, tên → mỗi lệch một dòng kèm hai giá trị', () => {
    const r = reconcileCatalog(
      [
        shop(
          'p1',
          [variant('p1/v1', { priceVnd: 120_000, compareAtVnd: 150_000, stock: 2 })],
          'Áo mới',
        ),
      ],
      [internal('p1')],
    );
    const at = (kind: string) => r.diffs.find((d) => d.kind === kind);
    expect(at('price')).toEqual({
      kind: 'price',
      productExternalId: 'p1',
      variantExternalId: 'p1/v1',
      internal: 100_000,
      shopify: 120_000,
    });
    expect(at('compare_at')).toMatchObject({ internal: null, shopify: 150_000 });
    expect(at('stock')).toMatchObject({ internal: 5, shopify: 2 });
    expect(at('name')).toMatchObject({
      variantExternalId: null,
      internal: 'Áo p1',
      shopify: 'Áo mới',
    });
    expect(r.diffs).toHaveLength(4);
    expect(r.summary.priceDiffs).toBe(2);
    expect(r.needsOwnerReview).toBe(true);
    expect(r.alerts.notifyOwner).toBe(true);
  });

  it('phía Shopify null (không VND / không theo dõi tồn) → KHÔNG tính lệch', () => {
    const r = reconcileCatalog(
      [shop('p1', [variant('p1/v1', { priceVnd: null, compareAtVnd: null, stock: null })])],
      [internal('p1')],
    );
    expect(r.diffs).toEqual([]);
  });

  it('Shopify không còn bán → gone_in_shopify; mới ở Shopify → chỉ đếm', () => {
    const r = reconcileCatalog(
      [shop('p2'), shop('p1')],
      [
        internal('p1', [
          { externalId: 'p1/v1', priceVnd: 100_000, compareAtVnd: null, stock: 5 },
          { externalId: 'p1/v2', priceVnd: 1, compareAtVnd: null, stock: 1 },
        ]),
        internal('p3'),
      ],
    );
    const kinds = r.diffs.map((d) => `${d.kind}:${d.variantExternalId ?? d.productExternalId}`);
    expect(kinds.sort()).toEqual(['gone_in_shopify:p1/v2', 'gone_in_shopify:p3']);
    expect(r.summary.newInShopify).toBe(1);
    expect(r.diffs.some((d) => d.productExternalId === 'p2')).toBe(false);
  });

  it('biến thể mới ở Shopify trong sản phẩm đã có → chỉ đếm, không thành lệch', () => {
    const r = reconcileCatalog(
      [shop('p1', [variant('p1/v1'), variant('p1/v2')])],
      [internal('p1')],
    );
    expect(r.diffs).toEqual([]);
    expect(r.summary).toMatchObject({ newInShopify: 1, variantsChecked: 2 });
  });

  it('lệch > 5% sản phẩm → báo Admin; đúng 5% thì chưa', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const shopList = ids.map((id) => shop(id));
    const make = (bad: number) =>
      ids.map((id, i) =>
        internal(id, [
          { externalId: `${id}/v1`, priceVnd: i < bad ? 1 : 100_000, compareAtVnd: null, stock: 5 },
        ]),
      );
    expect(RECONCILE_ADMIN_RATIO).toBe(0.05);
    expect(reconcileCatalog(shopList, make(1)).alerts.alertAdmin).toBe(false);
    expect(reconcileCatalog(shopList, make(2)).alerts.alertAdmin).toBe(true);
  });

  it('thiếu webhook → báo Admin dù không lệch', () => {
    const r = reconcileCatalog([shop('p1')], [internal('p1')], {
      webhookMissing: ['PRODUCTS_UPDATE'],
    });
    expect(r.alerts).toEqual({ notifyOwner: false, alertAdmin: true, diffRatioHigh: false });
  });

  it('không phụ thuộc thứ tự đầu vào (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 8 }),
        (prices) => {
          const s = prices.map((p, i) =>
            shop(`p${i}`, [variant(`p${i}/v1`, { priceVnd: p * 1000 })]),
          );
          const n = prices.map((_, i) => internal(`p${i}`));
          const a = reconcileCatalog(s, n);
          const b = reconcileCatalog([...s].reverse(), [...n].reverse());
          const key = (d: {
            kind: string;
            variantExternalId: string | null;
            productExternalId: string;
          }) => `${d.kind}|${d.productExternalId}|${d.variantExternalId}`;
          expect(a.diffs.map(key).sort()).toEqual(b.diffs.map(key).sort());
          expect(a.summary).toEqual(b.summary);
        },
      ),
    );
  });
});

describe('checkWebhookTopics (FR-113)', () => {
  it('liệt kê chủ đề bắt buộc còn thiếu', () => {
    expect(checkWebhookTopics(SHOPIFY_REQUIRED_WEBHOOK_TOPICS)).toEqual({ ok: true, missing: [] });
    const r = checkWebhookTopics(['PRODUCTS_UPDATE']);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(
      SHOPIFY_REQUIRED_WEBHOOK_TOPICS.filter((t) => t !== 'PRODUCTS_UPDATE'),
    );
  });
});

describe('canRunManualReconcile (Đối soát ngay, 1 lần/giờ)', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  it('chưa chạy lần nào → được', () => {
    expect(canRunManualReconcile(null, now)).toEqual({ allowed: true });
  });
  it('biên 1 giờ', () => {
    expect(canRunManualReconcile(new Date(now.getTime() - 59 * 60_000 - 59_000), now)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(canRunManualReconcile(new Date(now.getTime() - 60 * 60_000), now)).toEqual({
      allowed: true,
    });
  });
});
