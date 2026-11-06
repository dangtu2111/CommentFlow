import {
  type ImportProductPlan,
  type ImportVariantPlan,
  normalizeAttrs,
  productSearchText,
} from '@flow/shared';
import type { PancakeCatalog, PancakeProduct, PancakeVariant } from './connector';

/** Tối đa 12 chữ số (≈ 10^12 đồng) — chặn số vô lý trước khi ghi cột integer. */
const MAX_VND = 999_999_999_999;

/**
 * Giá Pancake (`retail_price`, số thực; cửa hàng Việt Nam tính bằng VND, Q-PAN1) → số nguyên đồng. Giá lẻ/âm/quá
 * lớn/không phải số → `null` (nguyên tắc #4: không tự làm tròn/quy đổi). Hàm thuần.
 */
export function parsePancakeMoney(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  return Number.isInteger(raw) && raw >= 0 && raw <= MAX_VND ? raw : null;
}

/** Tồn chỉ khi là số nguyên ≥ 0 (tồn lẻ/âm — không biết chắc → `null`). */
const stockOf = (variant: PancakeVariant): number | null =>
  variant.quantity !== null && Number.isInteger(variant.quantity) && variant.quantity >= 0
    ? variant.quantity
    : null;

function toVariant(variant: PancakeVariant): ImportVariantPlan {
  return {
    externalId: variant.id,
    sku: variant.sku,
    attrs: variant.attrs,
    attrsNorm: normalizeAttrs(variant.attrs),
    priceVnd: parsePancakeMoney(variant.price),
    // Open API không có giá gốc/giá so sánh.
    compareAtVnd: null,
    stock: stockOf(variant),
  };
}

function toProduct(product: PancakeProduct): ImportProductPlan {
  const variants = product.variants.filter((v) => v.sellable).map(toVariant);
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
    category: product.category === '' ? null : product.category,
    url: null,
    // Chỉ tên + SKU + thuộc tính; KHÔNG giá/tồn (nguyên tắc #4, FR-056).
    searchText: productSearchText({
      name: product.title,
      sku: skus.join(' '),
      variants: variants.flatMap((v) => [{ attrs: v.attrs }, { attrs: v.attrsNorm }]),
    }),
    priceVnd: cheapest?.priceVnd ?? null,
    compareAtVnd: null,
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
 * Danh mục Pancake → kế hoạch ghi cùng dạng với nhập Excel/Shopify/Haravan/Sapo/KiotViet (`ImportProductPlan`), để
 * dùng chung đường ghi `applyProductSourceSync` (FR-129). Chỉ sản phẩm và biến thể không bị ẩn; id sản phẩm/biến thể
 * = id Pancake dạng chuỗi (khóa đối soát `external_id`). Giá sản phẩm = giá thấp nhất của biến thể; tồn = tổng khi
 * mọi biến thể đều có tồn. Hàm thuần.
 */
export function buildPancakeImportPlan(catalog: PancakeCatalog): ImportProductPlan[] {
  return catalog.products.filter((product) => product.published).map(toProduct);
}
