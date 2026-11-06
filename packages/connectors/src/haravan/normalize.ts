import {
  type ImportProductPlan,
  type ImportVariantPlan,
  normalizeAttrs,
  productSearchText,
} from '@flow/shared';
import type { HaravanCatalog, HaravanProduct, HaravanVariant } from './connector';

/** Tối đa 12 chữ số (≈ 10^12 đồng) — chặn số vô lý trước khi ghi cột integer. */
const VND_AMOUNT = /^(\d{1,12})(\.0+)?$/;
/** Tùy chọn mặc định Haravan gắn cho sản phẩm không có biến thể thật. */
const DEFAULT_OPTION_VALUE = 'Default Title';

/**
 * Giá Haravan (chuỗi thập phân; shop Haravan tính bằng VND, Q-HRV1) → số nguyên đồng. Giá lẻ/sai dạng → `null`
 * (nguyên tắc #4: không tự làm tròn/quy đổi). Hàm thuần.
 */
export function parseHaravanMoney(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
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

/** Tồn chỉ khi shop theo dõi tồn và số hợp lệ (≥ 0); ngược lại không biết → `null`. */
const stockOf = (variant: HaravanVariant): number | null =>
  variant.managed &&
  variant.quantity !== null &&
  Number.isInteger(variant.quantity) &&
  variant.quantity >= 0
    ? variant.quantity
    : null;

/** Giá gốc 0 nghĩa là "không có giá gốc" ở Haravan → `null`. */
const compareAtOf = (variant: HaravanVariant): number | null => {
  const value = parseHaravanMoney(variant.compareAtPrice);
  return value === 0 ? null : value;
};

function attrsOf(product: HaravanProduct, variant: HaravanVariant): Record<string, string> {
  const attrs: Record<string, string> = {};
  variant.optionValues.forEach((value, index) => {
    const name = product.optionNames[index];
    if (name === undefined || name === '' || value === null || value === '') return;
    if (value === DEFAULT_OPTION_VALUE) return;
    attrs[name] = value;
  });
  return attrs;
}

function toVariant(product: HaravanProduct, variant: HaravanVariant): ImportVariantPlan {
  const attrs = attrsOf(product, variant);
  return {
    externalId: variant.id,
    sku: variant.sku === null || variant.sku === '' ? null : variant.sku,
    attrs,
    attrsNorm: normalizeAttrs(attrs),
    priceVnd: parseHaravanMoney(variant.price),
    compareAtVnd: compareAtOf(variant),
    stock: stockOf(variant),
  };
}

function toProduct(product: HaravanProduct): ImportProductPlan {
  const variants = product.variants.map((v) => toVariant(product, v));
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
    url: httpUrlOrNull(product.url),
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
 * Danh mục Haravan → kế hoạch ghi cùng dạng với nhập Excel/Shopify (`ImportProductPlan`), để dùng chung đường ghi
 * `applyProductSourceSync` (FR-129). Chỉ sản phẩm đã xuất bản; id sản phẩm/biến thể = id Haravan dạng chuỗi (khóa đối
 * soát `external_id`). Giá sản phẩm = giá thấp nhất của biến thể; tồn = tổng khi mọi biến thể đều có tồn. Hàm thuần.
 */
export function buildHaravanImportPlan(catalog: HaravanCatalog): ImportProductPlan[] {
  return catalog.products.filter((product) => product.published).map(toProduct);
}
