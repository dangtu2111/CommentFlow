/**
 * Cảnh báo tiền tệ của kết nối Shopify (Q-SNV1). Cửa hàng dùng tiền tệ khác VND thì giá để TRỐNG (không quy đổi, nguyên tắc #4);
 * trang kết nối nói rõ cho Owner. `currencyUnsupported` do job đồng bộ ghi (đã lọc 3 chữ cái hoa hoặc `OTHER`) nhưng vẫn kiểm
 * lại khi đọc vì đây là dữ liệu jsonb. Hàm thuần.
 */
export type ShopifyCurrencyWarning = { currency: string; variants: number };

export function shopifyCurrencyWarning(
  summary: Readonly<Record<string, unknown>>,
): ShopifyCurrencyWarning | null {
  const code = summary.currencyUnsupported;
  if (typeof code !== 'string' || !/^(?:[A-Z]{3}|OTHER)$/.test(code)) return null;
  const count = summary.variantsWithoutPrice;
  return {
    currency: code,
    variants: typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0,
  };
}
