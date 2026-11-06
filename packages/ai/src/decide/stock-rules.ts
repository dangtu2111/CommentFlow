import { foldText } from '@flow/shared';
import { z } from 'zod';

/**
 * Quy tắc tồn kho cho `decideAction` (DA-RULES-STOCK, FR-151, FR-157, Q-DRS1, `docs/09` §4).
 * Hàm thuần, không DB/LLM/đồng hồ thật (`now` tiêm vào). Đầu vào hỏng → `unknown` + `stockStale=true`
 * (thiên về chặn, không "mở khi lỗi"). Chỉ là phần GỢI Ý: tự gửi câu hết hàng/gợi ý để GĐ4.
 */

/** `automation_settings.stock_stale_days` mặc định (`docs/10`). */
export const DEFAULT_STOCK_STALE_DAYS = 3;
/** FR-157: tối đa 2 mẫu thay thế. */
export const MAX_ALTERNATIVES = 2;

const DAY_MS = 86_400_000;
/** Nguồn nhập tay: tồn kho chỉ đúng khi người dùng cập nhật gần đây (FR-151). */
const MANUAL_SOURCES: ReadonlySet<string> = new Set(['manual', 'excel']);
const SYNC_SOURCES = [
  'google_sheets',
  'shopify',
  'haravan',
  'sapo',
  'kiotviet',
  'pancake',
] as const;

/** Chỉ nhận Date hoặc chuỗi ngày (không để `null`/số bị ép thành 1970 rồi coi là tươi). */
const dateLike = z.union([z.date(), z.string()]).pipe(z.coerce.date());
const timestamp = z.union([z.null(), dateLike]);

const variantSchema = z.object({
  status: z.enum(['active', 'archived']),
  stock: z.number().int().min(0).nullable(),
  priceVnd: z.number().int().min(0).nullable(),
  updatedFromSourceAt: timestamp,
});

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(['manual', 'excel', ...SYNC_SOURCES]),
  status: z.enum(['active', 'archived']),
  category: z.string().nullable(),
  updatedFromSourceAt: timestamp,
  /** Lần đồng bộ gần nhất báo lỗi (FR-151: "nguồn đồng bộ lỗi" cũng xét độ tươi). */
  syncError: z.boolean(),
  variants: z.array(variantSchema),
});

const inputSchema = z.object({
  now: dateLike,
  staleDays: z.number().int().min(1).max(365).default(DEFAULT_STOCK_STALE_DAYS),
  /** `automation_settings.suggest_alternatives`: mặc định TẮT. */
  suggestAlternatives: z.boolean().default(false),
  product: productSchema,
  /** Sản phẩm khác để gợi ý; từng phần tử hỏng bị bỏ riêng, không làm hỏng cả đầu vào. */
  catalog: z.array(z.unknown()).default([]),
});

type Product = z.output<typeof productSchema>;

export type StockFreshness = 'fresh' | 'stale' | 'unknown';
export type StockAvailability = 'in_stock' | 'sold_out' | 'discontinued' | 'unknown';

export type StockAlternative = { productId: string; name: string; priceVnd: number };

export type StockOutcome = {
  freshness: StockFreshness;
  /** Cấp cho `decideAction` `risks.stockStale`: không được nói số lượng/còn hàng. */
  stockStale: boolean;
  availability: StockAvailability;
  /** Chỉ `true` khi dữ liệu tươi và còn hàng. */
  canStateQuantity: boolean;
  alternatives: StockAlternative[];
};

const UNREADABLE: StockOutcome = {
  freshness: 'unknown',
  stockStale: true,
  availability: 'unknown',
  canStateQuantity: false,
  alternatives: [],
};

/** Mốc cập nhật cũ nhất giữa sản phẩm và biến thể (thiên về chặn); sản phẩm thiếu mốc → cũ. */
function isStale(product: Product, now: Date, staleDays: number): boolean {
  const needsCheck = MANUAL_SOURCES.has(product.source) || product.syncError;
  if (!needsCheck) return false;
  if (product.updatedFromSourceAt === null) return true;
  const times = [product.updatedFromSourceAt, ...product.variants.map((v) => v.updatedFromSourceAt)]
    .filter((at): at is Date => at !== null)
    .map((at) => at.getTime());
  return now.getTime() - Math.min(...times) > staleDays * DAY_MS;
}

function availabilityOf(product: Product, fresh: boolean): StockAvailability {
  if (product.status === 'archived') return 'discontinued';
  if (!fresh) return 'unknown';
  const selling = product.variants.filter((variant) => variant.status === 'active');
  if (selling.some((variant) => (variant.stock ?? 0) > 0)) return 'in_stock';
  if (selling.length > 0 && selling.every((variant) => variant.stock === 0)) return 'sold_out';
  return 'unknown';
}

type Assessment = { fresh: boolean; availability: StockAvailability };

function assess(product: Product, now: Date, staleDays: number): Assessment {
  const fresh = !isStale(product, now, staleDays);
  return { fresh, availability: availabilityOf(product, fresh) };
}

/** Giá thấp nhất trong biến thể đang bán còn hàng; không có giá → `null` (không gợi ý được). */
function lowestInStockPrice(product: Product): number | null {
  const prices = product.variants
    .filter((variant) => variant.status === 'active' && (variant.stock ?? 0) > 0)
    .map((variant) => variant.priceVnd)
    .filter((price): price is number => price !== null);
  return prices.length === 0 ? null : Math.min(...prices);
}

function suggestAlternatives(
  current: Product,
  catalog: unknown[],
  now: Date,
  staleDays: number,
): StockAlternative[] {
  const category = foldText(current.category ?? '');
  if (category === '') return [];
  return catalog
    .flatMap((raw) => {
      const parsed = productSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .filter(
      (candidate) =>
        candidate.id !== current.id &&
        candidate.status === 'active' &&
        foldText(candidate.category ?? '') === category &&
        assess(candidate, now, staleDays).availability === 'in_stock',
    )
    .flatMap((candidate) => {
      const priceVnd = lowestInStockPrice(candidate);
      return priceVnd === null ? [] : [{ productId: candidate.id, name: candidate.name, priceVnd }];
    })
    .sort(
      (a, b) =>
        a.priceVnd - b.priceVnd ||
        a.name.localeCompare(b.name, 'en') ||
        a.productId.localeCompare(b.productId, 'en'),
    )
    .slice(0, MAX_ALTERNATIVES);
}

/** Đánh giá độ tươi/còn hàng của MỘT sản phẩm (FR-151, FR-157). Nhận `unknown`, không ném. */
export function evaluateStockRules(raw: unknown): StockOutcome {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return UNREADABLE;
  const { now, staleDays, product, catalog, suggestAlternatives: wantAlternatives } = parsed.data;

  const { fresh, availability } = assess(product, now, staleDays);
  const lacksStock = availability === 'sold_out' || availability === 'discontinued';
  return {
    freshness: fresh ? 'fresh' : 'stale',
    // Sản phẩm ngưng bán không cần "kiểm kho": trạng thái đã rõ.
    stockStale: !fresh && availability !== 'discontinued',
    availability,
    canStateQuantity: fresh && availability === 'in_stock',
    alternatives:
      wantAlternatives && lacksStock ? suggestAlternatives(product, catalog, now, staleDays) : [],
  };
}

/** Có ≥ 1 sản phẩm ứng viên mà tồn kho không chắc → cờ `risks.stockStale` của `decideAction`. */
export function anyStockStale(outcomes: ReadonlyArray<{ stockStale: boolean }>): boolean {
  return outcomes.some((outcome) => outcome.stockStale);
}
