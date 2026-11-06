import { normalizeAttrs } from '../products';
import { productSearchText } from '../search';
import type { ImportRecord } from './validate';

export type ImportVariantPlan = {
  /** Khóa ổn định để chạy lại file không nhân đôi: `sku:<SKU>` | `attrs:<thuộc tính chuẩn hóa>` | `default`. */
  externalId: string;
  sku: string | null;
  attrs: Record<string, string>;
  attrsNorm: Record<string, string>;
  priceVnd: number | null;
  compareAtVnd: number | null;
  stock: number | null;
};

export type ImportProductPlan = {
  /** `products.external_id` (nguồn `excel`): mã sản phẩm hoặc tên đã chuẩn hóa. */
  externalId: string;
  name: string;
  category: string | null;
  url: string | null;
  searchText: string;
  priceVnd: number | null;
  compareAtVnd: number | null;
  stock: number | null;
  /** Bản gốc biến thể giữ để đối chiếu (`products.variants`). */
  variantsSnapshot: Array<
    Pick<ImportVariantPlan, 'sku' | 'attrs' | 'priceVnd' | 'compareAtVnd' | 'stock'>
  >;
  variants: ImportVariantPlan[];
};

function variantExternalId(sku: string | null, attrsNorm: Record<string, string>): string {
  if (sku !== null) return `sku:${sku}`;
  const signature = Object.entries(attrsNorm)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  return signature === '' ? 'default' : `attrs:${signature}`;
}

function toVariant(record: ImportRecord): ImportVariantPlan {
  const attrsNorm = normalizeAttrs(record.attrs);
  return {
    externalId: variantExternalId(record.sku, attrsNorm),
    sku: record.sku,
    attrs: record.attrs,
    attrsNorm,
    priceVnd: record.priceVnd,
    compareAtVnd: record.compareAtVnd,
    stock: record.stock,
  };
}

function toProduct(records: readonly ImportRecord[]): ImportProductPlan {
  const first = records[0] as ImportRecord;
  const variants = records.map(toVariant);
  const priced = variants.filter((v) => v.priceVnd !== null);
  const cheapest = priced.reduce<ImportVariantPlan | null>(
    (best, v) => (best === null || (v.priceVnd as number) < (best.priceVnd as number) ? v : best),
    null,
  );
  const stocks = variants.map((v) => v.stock);
  const skus = variants.flatMap((v) => (v.sku === null ? [] : [v.sku]));
  return {
    externalId: first.productKey,
    name: first.productName,
    category: records.find((r) => r.category !== null)?.category ?? null,
    url: records.find((r) => r.url !== null)?.url ?? null,
    // Chỉ tên + SKU + thuộc tính; KHÔNG giá/tồn (nguyên tắc #4, FR-056).
    searchText: productSearchText({
      name: first.productName,
      sku: skus.join(' '),
      variants: variants.flatMap((v) => [{ attrs: v.attrs }, { attrs: v.attrsNorm }]),
    }),
    priceVnd: cheapest?.priceVnd ?? null,
    compareAtVnd: cheapest?.compareAtVnd ?? null,
    stock: stocks.every((s) => s !== null)
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
 * Gom các dòng hợp lệ thành sản phẩm + biến thể (Q-KBIX1 e), giữ thứ tự xuất hiện. Giá sản phẩm = giá thấp nhất
 * của biến thể (kèm giá gốc của chính biến thể đó); tồn sản phẩm = tổng khi mọi biến thể đều có tồn, ngược lại `null`.
 * Hàm thuần.
 */
export function buildImportPlan(records: readonly ImportRecord[]): ImportProductPlan[] {
  const groups = new Map<string, ImportRecord[]>();
  for (const record of records) {
    const group = groups.get(record.productKey);
    if (group) group.push(record);
    else groups.set(record.productKey, [record]);
  }
  return [...groups.values()].map(toProduct);
}
