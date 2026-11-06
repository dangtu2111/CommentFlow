import { z } from 'zod';

/**
 * Ảnh chụp giá/tồn kho lúc AI soạn (FR-111, docs/10 `drafts.price_snapshot`, docs/09 §6.1 R5).
 * Lưu jsonb `[{product_id, variant_id, price_vnd, stock, updated_from_source_at}]`; `sendRecheck` so với giá hiện tại
 * ngay trước khi gửi. Tên trường snake_case đúng spec (lưu thẳng vào cột). Chỉ chụp mục CÓ giá — mục không giá
 * không có gì để đối chiếu.
 */
const nonNegativeInt = z.number().int().min(0);

export const priceSnapshotEntrySchema = z.object({
  product_id: z.string().min(1),
  /** `null` = giá ở cấp sản phẩm (không có biến thể). */
  variant_id: z.string().min(1).nullable(),
  price_vnd: nonNegativeInt,
  stock: nonNegativeInt.nullable(),
  /** `updated_from_source_at` của nguồn (ISO 8601); `null` = chưa đồng bộ từ nguồn. */
  updated_from_source_at: z.iso.datetime({ offset: true }).nullable(),
});
export type PriceSnapshotEntry = z.output<typeof priceSnapshotEntrySchema>;

export const priceSnapshotSchema = z.array(priceSnapshotEntrySchema);
export type PriceSnapshot = PriceSnapshotEntry[];

/** Một dòng `products`/`product_variants` đã đọc (giá có thể `null`). */
export type PriceSource = {
  productId: string;
  variantId?: string | null;
  priceVnd: number | null;
  stock: number | null;
  updatedFromSourceAt: Date | string | null;
};

const toIso = (v: Date | string | null): string | null =>
  v === null ? null : new Date(v).toISOString();

const entryKey = (e: { product_id: string; variant_id: string | null }): string =>
  `${e.product_id}\u0000${e.variant_id ?? ''}`;

const byKey = (a: PriceSnapshotEntry, b: PriceSnapshotEntry): number => {
  const ka = entryKey(a);
  const kb = entryKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/**
 * Dựng ảnh chụp từ các dòng nguồn: bỏ mục không giá, loại trùng (sản phẩm, biến thể) giữ mục đầu, sắp xếp ổn định.
 * Dữ liệu hỏng (giá âm/lẻ, mốc không hợp lệ) → ném lỗi Zod, không âm thầm bỏ qua.
 */
export function buildPriceSnapshot(sources: readonly PriceSource[]): PriceSnapshot {
  const seen = new Set<string>();
  const entries: PriceSnapshotEntry[] = [];
  for (const s of sources) {
    if (s.priceVnd === null) continue;
    const entry = priceSnapshotEntrySchema.parse({
      product_id: s.productId,
      variant_id: s.variantId ?? null,
      price_vnd: s.priceVnd,
      stock: s.stock,
      updated_from_source_at: toIso(s.updatedFromSourceAt),
    });
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries.sort(byKey);
}

/** Đọc lại cột jsonb từ DB (kiểm Zod). */
export function parsePriceSnapshot(value: unknown) {
  return priceSnapshotSchema.safeParse(value);
}
