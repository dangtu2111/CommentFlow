/**
 * Trang Danh mục sản phẩm (KB-CATALOG): phần THUẦN — đọc tham số URL, định dạng giá, trạng thái tồn, phân trang. Không đọc DB/phiên.
 * Mọi tham số từ URL chỉ là DỮ LIỆU: giá trị lạ rơi về mặc định, không bao giờ đi thẳng vào truy vấn.
 */
export const CATALOG_SOURCES = ['shopify', 'excel', 'manual'] as const;
export type CatalogSource = (typeof CATALOG_SOURCES)[number];
export type CatalogStatus = 'active' | 'archived';

export type CatalogParams = {
  q: string;
  source: CatalogSource | undefined;
  status: CatalogStatus;
  page: number;
};

const MAX_QUERY = 100;
const MAX_PAGE = 1000;
/** Dưới mức này gọi là "sắp hết" (khớp thiết kế: Sắp hết < 10). */
export const LOW_STOCK_BELOW = 10;

/** Nguồn của dòng → nhãn: ba nguồn có tab riêng, còn lại gộp "khác". */
export function catalogSourceKey(source: string): CatalogSource | 'other' {
  return (CATALOG_SOURCES as readonly string[]).includes(source)
    ? (source as CatalogSource)
    : 'other';
}

type RawParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export function parseCatalogParams(raw: RawParams): CatalogParams {
  const source = one(raw.source);
  const page = /^\d{1,8}$/.test(one(raw.page)) ? Number(one(raw.page)) : 1;
  return {
    q: one(raw.q).trim().slice(0, MAX_QUERY),
    source: (CATALOG_SOURCES as readonly string[]).includes(source)
      ? (source as CatalogSource)
      : undefined,
    status: one(raw.status) === 'archived' ? 'archived' : 'active',
    page: Math.min(Math.max(page, 1), MAX_PAGE),
  };
}

type PriceFields = {
  priceVnd: number | null;
  compareAtVnd: number | null;
  currencyCode: string;
  priceMinor: number | null;
  compareAtMinor: number | null;
};

const vnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;

/** Giá VND theo đồng; tiền tệ khác theo đơn vị nhỏ nhất của tiền tệ gốc (KHÔNG quy đổi — Q-SFP1). Giá so sánh chỉ hiện khi cao hơn giá bán. */
export function formatCatalogPrice(
  p: PriceFields,
): { price: string; compareAt: string | null } | null {
  if (p.currencyCode === 'VND') {
    if (p.priceVnd === null) return null;
    const compare = p.compareAtVnd !== null && p.compareAtVnd > p.priceVnd ? p.compareAtVnd : null;
    return { price: vnd(p.priceVnd), compareAt: compare === null ? null : vnd(compare) };
  }
  if (p.priceMinor === null || !/^[A-Z]{3}$/.test(p.currencyCode)) return null;
  try {
    const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currencyCode });
    const divisor = 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2);
    const compare =
      p.compareAtMinor !== null && p.compareAtMinor > p.priceMinor ? p.compareAtMinor : null;
    return {
      price: format.format(p.priceMinor / divisor),
      compareAt: compare === null ? null : format.format(compare / divisor),
    };
  } catch {
    return null;
  }
}

export type StockState = 'unknown' | 'out' | 'low' | 'in';
export function stockState(stock: number | null): StockState {
  if (stock === null) return 'unknown';
  if (stock <= 0) return 'out';
  return stock < LOW_STOCK_BELOW ? 'low' : 'in';
}

export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number; pages: number } {
  if (total === 0) return { from: 0, to: 0, pages: 1 };
  return {
    from: (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
    pages: Math.ceil(total / pageSize),
  };
}

/** Liên kết giữ bộ lọc hiện tại; giá trị mặc định (tất cả nguồn, đang hoạt động, trang 1, không từ khóa) bị bỏ. */
export function catalogHref(p: CatalogParams): string {
  const params = new URLSearchParams();
  if (p.q) params.set('q', p.q);
  if (p.source) params.set('source', p.source);
  if (p.status !== 'active') params.set('status', p.status);
  if (p.page > 1) params.set('page', String(p.page));
  const qs = params.toString();
  return qs ? `/app/kb/catalog?${qs}` : '/app/kb/catalog';
}
