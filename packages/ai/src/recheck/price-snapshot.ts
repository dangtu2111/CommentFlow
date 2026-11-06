import { type PriceSource, parsePriceSnapshot } from '@flow/shared';
import type { RecheckPriceEntry } from './send-recheck';

/**
 * Nối `drafts.price_snapshot` (FR-111) vào điều kiện R5 của `sendRecheck` (docs/09 §6.1). Hàm thuần: nơi gọi
 * (job gửi) đọc cột jsonb và giá hiện tại từ `products`/`product_variants`.
 */

/**
 * Ảnh chụp lưu ở `drafts` → mục R5. Cột hỏng/không đọc được → `[]`: R5 coi là `price_snapshot_missing` và CHẶN
 * (an toàn hơn bỏ qua), nên không cần ném lỗi ở đây. Tồn kho được lưu để hiển thị/đối chiếu, R5 chỉ so giá + mốc đồng bộ.
 */
export function priceEntriesFromSnapshot(column: unknown): RecheckPriceEntry[] {
  const parsed = parsePriceSnapshot(column);
  if (!parsed.success) return [];
  return parsed.data.map((e) => ({
    productId: e.product_id,
    variantId: e.variant_id,
    priceVnd: e.price_vnd,
    updatedFromSourceAt: e.updated_from_source_at,
  }));
}

/** Giá hiện tại từ các dòng sản phẩm/biến thể đọc lúc gửi (mục không giá bị bỏ — không có gì để so). */
export function priceEntriesFromSources(sources: readonly PriceSource[]): RecheckPriceEntry[] {
  return sources.flatMap((s) =>
    s.priceVnd === null
      ? []
      : [
          {
            productId: s.productId,
            variantId: s.variantId ?? null,
            priceVnd: s.priceVnd,
            updatedFromSourceAt: s.updatedFromSourceAt,
          },
        ],
  );
}
