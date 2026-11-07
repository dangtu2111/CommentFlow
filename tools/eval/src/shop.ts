import {
  type DraftVoice,
  missingAxesOf,
  productFactText,
  searchShopTexts,
  type TryKnowledge,
} from '@flow/ai';
import { normalizeAttrs, unsafeMarkMasked } from '@flow/shared';
import { z } from 'zod';

/**
 * Cửa hàng mẫu (fixture) cho EVAL-RUNNER: sản phẩm/biến thể/giá/tồn, chính sách/FAQ, giọng văn. Dựng `TryKnowledge` bằng
 * ĐÚNG các hàm của lõi AI (`productFactText`, `searchShopTexts`, `missingAxesOf`) để đo cái chạy thật, không phải bản riêng.
 * Dữ liệu trong repo là dữ liệu GIẢ (cửa hàng "Demo"); bộ mẫu thật dùng cửa hàng thật của chủ dự án, không commit.
 */
const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Cách khách gọi khác (tên tiếng Anh, tên rút gọn). */
  aliases: z.array(z.string()).default([]),
  priceVnd: z.number().int().nonnegative().nullable(),
  /** Cửa hàng dùng tiền tệ khác VND (Q-SFP1, vd. Shopify USD): giá nằm ở `priceMinor` (đơn vị nhỏ nhất, vd. cent); `priceVnd` = null. */
  currencyCode: z.string().min(3).max(3).default('VND'),
  priceMinor: z.number().int().nonnegative().nullable().default(null),
  stock: z.number().int().nonnegative().nullable(),
  variants: z
    .array(
      z.object({
        attrs: z.record(z.string(), z.string()),
        priceVnd: z.number().int().nonnegative().nullable(),
        priceMinor: z.number().int().nonnegative().nullable().default(null),
        stock: z.number().int().nonnegative().nullable(),
      }),
    )
    .default([]),
});

const textSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['policy', 'faq']),
  policyKind: z.string().nullable(),
  lang: z.enum(['vi', 'en', 'all']),
  title: z.string().min(1),
  text: z.string().min(1),
});

export const shopFixtureSchema = z.object({
  id: z.string().min(1),
  voice: z.object({
    shopPronoun: z.enum(['em', 'shop', 'minh']),
    customerAddress: z.enum(['anh_chi', 'ban', 'quy_khach', 'you']),
    do: z.array(z.string()).default([]),
    dont: z.array(z.string()).default([]),
  }),
  products: z.array(productSchema),
  texts: z.array(textSchema),
});
export type ShopFixture = z.infer<typeof shopFixtureSchema>;

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim();

export function shopVoice(shop: ShopFixture): DraftVoice {
  return {
    do: shop.voice.do,
    dont: shop.voice.dont,
    shopPronoun: shop.voice.shopPronoun,
    customerAddress: shop.voice.customerAddress,
  };
}

/** Sản phẩm mà một lời nhắc khớp: tên hoặc bí danh chứa lời nhắc (hoặc ngược lại), bỏ dấu, không phân biệt hoa/thường. */
function matches(product: ShopFixture['products'][number], mention: string): boolean {
  const wanted = fold(mention);
  if (wanted.length < 2) return false;
  return [product.name, ...product.aliases].some((name) => {
    const own = fold(name);
    return own.includes(wanted) || wanted.includes(own);
  });
}

const toTryProduct = (product: ShopFixture['products'][number]) => ({
  id: product.id,
  name: product.name,
  priceVnd: product.priceVnd,
  currencyCode: product.currencyCode,
  priceMinor: product.priceMinor,
  stock: product.stock,
  variants: product.variants.map((variant) => ({
    attrs: variant.attrs,
    attrsNorm: normalizeAttrs(variant.attrs),
    priceVnd: variant.priceVnd,
    currencyCode: product.currencyCode,
    priceMinor: variant.priceMinor,
    stock: variant.stock,
  })),
});

export function buildShopKnowledge(shop: ShopFixture): TryKnowledge {
  const byId = new Map(shop.products.map((product) => [product.id, product]));
  return {
    async matchProducts(mentions) {
      const ids = new Set<string>();
      for (const mention of mentions) {
        for (const product of shop.products) if (matches(product, mention)) ids.add(product.id);
      }
      const found = [...ids].flatMap((id) => {
        const product = byId.get(id);
        return product ? [toTryProduct(product)] : [];
      });
      return {
        ids: found.map((product) => product.id),
        names: found.map((product) => product.name),
        missingAxes: found.length === 1 && found[0] ? missingAxesOf(found[0]) : [],
      };
    },
    async lookupProductFacts(ids) {
      return ids.flatMap((id) => {
        const product = byId.get(id);
        if (!product) return [];
        const tryProduct = toTryProduct(product);
        return [
          {
            id: product.id,
            kind: 'product' as const,
            title: product.name,
            text: unsafeMarkMasked(productFactText(tryProduct)),
            score: 1,
            topics: ['product_info' as const, 'size' as const],
          },
        ];
      });
    },
    async searchKb(query, context) {
      return searchShopTexts(shop.texts, query, context);
    },
  };
}
