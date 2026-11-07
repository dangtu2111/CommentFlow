import { describe, expect, it } from 'vitest';
import { shopifyCurrencyWarning } from './shopify-currency';

describe('shopifyCurrencyWarning — cảnh báo Owner khi cửa hàng không dùng VND', () => {
  it('VND (không có khóa) → không cảnh báo', () => {
    expect(shopifyCurrencyWarning({})).toBeNull();
    expect(shopifyCurrencyWarning({ productsCreated: 3 })).toBeNull();
  });

  it('tiền tệ khác → mã tiền tệ + số biến thể chưa có giá', () => {
    expect(
      shopifyCurrencyWarning({ currencyUnsupported: 'USD', variantsWithoutPrice: 12 }),
    ).toEqual({
      currency: 'USD',
      variants: 12,
    });
    expect(shopifyCurrencyWarning({ currencyUnsupported: 'OTHER' })).toEqual({
      currency: 'OTHER',
      variants: 0,
    });
  });

  it('dữ liệu hỏng (không đúng định dạng) → bỏ qua, không hiển thị chuỗi lạ', () => {
    expect(shopifyCurrencyWarning({ currencyUnsupported: 'usd<script>' })).toBeNull();
    expect(shopifyCurrencyWarning({ currencyUnsupported: 5 })).toBeNull();
    expect(
      shopifyCurrencyWarning({ currencyUnsupported: 'EUR', variantsWithoutPrice: -3 }),
    ).toEqual({ currency: 'EUR', variants: 0 });
  });
});
