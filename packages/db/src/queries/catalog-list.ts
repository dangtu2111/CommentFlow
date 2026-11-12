import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * KB-CATALOG: danh sách sản phẩm cho trang Danh mục kiến thức. CHỈ ĐỌC, một giao dịch `withActor` (RLS theo workspace).
 * Giá/tồn đọc từ `products` (không từ vector). Không trả nội dung thẻ/ghi chú AI (trang chưa sửa được các thứ đó).
 */
export type CatalogProductRow = {
  id: string;
  name: string;
  sku: string | null;
  source: string;
  category: string | null;
  priceVnd: number | null;
  compareAtVnd: number | null;
  currencyCode: string;
  priceMinor: number | null;
  compareAtMinor: number | null;
  stock: number | null;
  status: 'active' | 'archived';
  variantCount: number;
  updatedAt: Date;
};

export type CatalogListOptions = {
  /** Một nguồn (`shopify`, `excel`, `manual`…); bỏ qua = tất cả. */
  source?: string;
  /** Tìm theo tên hoặc SKU, không phân biệt hoa thường. */
  query?: string;
  status?: 'active' | 'archived';
  page?: number;
  pageSize?: number;
};

export type CatalogList = {
  rows: CatalogProductRow[];
  /** Tổng số khớp bộ lọc (để phân trang). */
  total: number;
  /** Số sản phẩm theo nguồn, theo trạng thái + tìm kiếm nhưng KHÔNG theo bộ lọc nguồn (để hiện số trên các tab nguồn). */
  bySource: Record<string, number>;
};

export const CATALOG_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** `%`, `_`, `\` trong từ khóa là chữ thường, không phải ký tự đại diện của LIKE. */
const likePattern = (query: string): string => `%${query.replace(/[\\%_]/g, '\\$&')}%`;

export async function listCatalogProducts(
  tx: Database,
  workspaceId: string,
  options: CatalogListOptions,
): Promise<CatalogList> {
  const status = options.status ?? 'active';
  const pageSize = Math.min(Math.max(options.pageSize ?? CATALOG_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(options.page ?? 1, 1);
  const query = options.query?.trim() ?? '';
  const search =
    query === ''
      ? sql``
      : sql`AND (p.name ILIKE ${likePattern(query)} ESCAPE '\\' OR p.sku ILIKE ${likePattern(query)} ESCAPE '\\')`;
  const base = sql`p.workspace_id = ${workspaceId}::uuid AND p.status = ${status} ${search}`;
  const sourceFilter = options.source ? sql`AND p.source = ${options.source}` : sql``;

  const counts = await tx.execute<{ source: string; n: string }>(
    sql`SELECT p.source, count(*) AS n FROM cf.products p WHERE ${base} GROUP BY p.source`,
  );
  const bySource = Object.fromEntries(counts.rows.map((row) => [row.source, Number(row.n)]));
  const total = options.source
    ? (bySource[options.source] ?? 0)
    : Object.values(bySource).reduce((sum, n) => sum + n, 0);

  const r = await tx.execute<{
    id: string;
    name: string;
    sku: string | null;
    source: string;
    category: string | null;
    price_vnd: string | number | null;
    compare_at_vnd: string | number | null;
    currency_code: string;
    price_minor: string | number | null;
    compare_at_minor: string | number | null;
    stock: number | null;
    status: 'active' | 'archived';
    variant_count: string | number;
    updated_at: string | Date;
  }>(sql`
    SELECT p.id, p.name, p.sku, p.source, p.category, p.price_vnd, p.compare_at_vnd, p.currency_code,
           p.price_minor, p.compare_at_minor, p.stock, p.status, p.updated_at,
           (SELECT count(*) FROM cf.product_variants v
             WHERE v.workspace_id = p.workspace_id AND v.product_id = p.id AND v.status = 'active') AS variant_count
      FROM cf.products p
     WHERE ${base} ${sourceFilter}
     ORDER BY p.updated_at DESC, p.id
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  const num = (value: string | number | null): number | null =>
    value === null ? null : Number(value);
  return {
    total,
    bySource,
    rows: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      source: row.source,
      category: row.category,
      priceVnd: num(row.price_vnd),
      compareAtVnd: num(row.compare_at_vnd),
      currencyCode: row.currency_code,
      priceMinor: num(row.price_minor),
      compareAtMinor: num(row.compare_at_minor),
      stock: row.stock,
      status: row.status,
      variantCount: Number(row.variant_count),
      updatedAt: new Date(row.updated_at),
    })),
  };
}
