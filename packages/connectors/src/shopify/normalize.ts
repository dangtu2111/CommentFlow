import {
  type ImportProductPlan,
  type ImportVariantPlan,
  normalizeAttrs,
  productSearchText,
} from '@flow/shared';
import type { ShopifyCatalog, ShopifyProduct, ShopifyVariant } from './connector';

/** Tối đa 12 chữ số (≈ 10^12 đồng) — chặn số vô lý trước khi ghi cột integer. */
const VND_AMOUNT = /^(\d{1,12})(\.0+)?$/;
/** Tùy chọn mặc định Shopify gắn cho sản phẩm không có biến thể thật. */
const DEFAULT_OPTION = { name: 'Title', value: 'Default Title' };

/**
 * Giá Shopify (chuỗi thập phân, tiền tệ của cửa hàng) → số nguyên đồng. CHỈ nhận `VND`; tiền tệ khác hoặc giá lẻ/sai
 * dạng → `null` (nguyên tắc #4: AI không tự quy đổi). Hàm thuần.
 */
export function parseShopifyMoney(
  raw: string | null | undefined,
  currencyCode: string,
): number | null {
  if (currencyCode !== 'VND' || raw === null || raw === undefined) return null;
  const match = VND_AMOUNT.exec(raw.trim());
  return match ? Number(match[1]) : null;
}

const httpUrlOrNull = (raw: string | null): string | null => {
  if (raw === null) return null;
  try {
    const protocol = new URL(raw).protocol;
    return protocol === 'https:' || protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
};

/** Ảnh chỉ nhận https (CDN Shopify); dạng khác → không có ảnh. */
const httpsUrlOrNull = (raw: string | null): string | null => {
  const url = httpUrlOrNull(raw);
  return url !== null && url.startsWith('https://') ? url : null;
};

/** Tồn chỉ khi cửa hàng theo dõi tồn và số hợp lệ (≥ 0); ngược lại không biết → `null`. */
const stockOf = (variant: ShopifyVariant): number | null =>
  variant.tracked &&
  variant.inventoryQuantity !== null &&
  Number.isInteger(variant.inventoryQuantity) &&
  variant.inventoryQuantity >= 0
    ? variant.inventoryQuantity
    : null;

function toVariant(variant: ShopifyVariant, currencyCode: string): ImportVariantPlan {
  const attrs: Record<string, string> = {};
  for (const option of variant.selectedOptions) {
    if (option.name === DEFAULT_OPTION.name && option.value === DEFAULT_OPTION.value) continue;
    attrs[option.name] = option.value;
  }
  return {
    externalId: variant.id,
    sku: variant.sku === null || variant.sku === '' ? null : variant.sku,
    attrs,
    attrsNorm: normalizeAttrs(attrs),
    priceVnd: parseShopifyMoney(variant.price, currencyCode),
    compareAtVnd: parseShopifyMoney(variant.compareAtPrice, currencyCode),
    stock: stockOf(variant),
  };
}

function toProduct(product: ShopifyProduct, currencyCode: string): ImportProductPlan {
  const variants = product.variants.map((v) => toVariant(v, currencyCode));
  const cheapest = variants.reduce<ImportVariantPlan | null>(
    (best, v) =>
      v.priceVnd !== null && (best === null || v.priceVnd < (best.priceVnd as number)) ? v : best,
    null,
  );
  const stocks = variants.map((v) => v.stock);
  const skus = variants.flatMap((v) => (v.sku === null ? [] : [v.sku]));
  return {
    externalId: product.id,
    name: product.title,
    category: product.productType === '' ? null : product.productType,
    url: httpUrlOrNull(product.onlineStoreUrl),
    imageUrl: httpsUrlOrNull(product.imageUrl),
    // Chỉ tên + SKU + thuộc tính; KHÔNG giá/tồn (nguyên tắc #4, FR-056).
    searchText: productSearchText({
      name: product.title,
      sku: skus.join(' '),
      variants: variants.flatMap((v) => [{ attrs: v.attrs }, { attrs: v.attrsNorm }]),
    }),
    priceVnd: cheapest?.priceVnd ?? null,
    compareAtVnd: cheapest?.compareAtVnd ?? null,
    stock:
      stocks.length > 0 && stocks.every((s) => s !== null)
        ? stocks.reduce<number>((sum, s) => sum + (s ?? 0), 0)
        : null,
    variantsSnapshot: variants.map(({ sku, attrs, priceVnd, compareAtVnd, stock }) => ({
      sku,
      attrs,
      priceVnd,
      compareAtVnd,
      stock,
    })),
    variants,
  };
}

/**
 * Danh mục Shopify → kế hoạch ghi cùng dạng với nhập Excel (`ImportProductPlan`), để dùng chung đường ghi vào
 * `products`/`product_variants` (FR-129). Chỉ sản phẩm `ACTIVE`; id sản phẩm/biến thể = gid Shopify (khóa đối soát
 * `external_id`). Giá sản phẩm = giá thấp nhất của biến thể; tồn = tổng khi mọi biến thể đều có tồn. Hàm thuần.
 */
export function buildShopifyImportPlan(catalog: ShopifyCatalog): ImportProductPlan[] {
  return catalog.products
    .filter((product) => product.status === 'ACTIVE')
    .map((product) => toProduct(product, catalog.currencyCode));
}
