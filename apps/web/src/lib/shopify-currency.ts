/**
 * Thông báo tiền tệ của kết nối Shopify (Q-SFP1). Cửa hàng dùng tiền tệ khác VND thì giá được GIỮ theo tiền tệ gốc (không quy đổi,
 * nguyên tắc #4); trang kết nối nói rõ cho Owner. `foreignCurrency` do job đồng bộ ghi (đã lọc 3 chữ cái hoa hoặc `OTHER`)
 * nhưng vẫn kiểm lại khi đọc vì đây là dữ liệu jsonb. Hàm thuần.
 */
export type ShopifyCurrencyNotice = { currency: string; variants: number };

export function shopifyCurrencyNotice(
  summary: Readonly<Record<string, unknown>>,
): ShopifyCurrencyNotice | null {
  const code = summary.foreignCurrency;
  if (typeof code !== 'string' || !/^(?:[A-Z]{3}|OTHER)$/.test(code)) return null;
  const count = summary.variantsWithoutPrice;
  return {
    currency: code,
    variants: typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0,
  };
}
