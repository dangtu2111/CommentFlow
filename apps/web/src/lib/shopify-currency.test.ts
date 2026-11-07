import { describe, expect, it } from 'vitest';
import { shopifyCurrencyNotice } from './shopify-currency';

describe('shopifyCurrencyNotice — thông báo Owner khi cửa hàng không dùng VND', () => {
  it('VND (không có khóa) → không thông báo', () => {
    expect(shopifyCurrencyNotice({})).toBeNull();
    expect(shopifyCurrencyNotice({ productsCreated: 3 })).toBeNull();
  });

  it('tiền tệ khác → mã tiền tệ + số biến thể chưa có giá', () => {
    expect(shopifyCurrencyNotice({ foreignCurrency: 'USD', variantsWithoutPrice: 12 })).toEqual({
      currency: 'USD',
      variants: 12,
    });
    expect(shopifyCurrencyNotice({ foreignCurrency: 'OTHER' })).toEqual({
      currency: 'OTHER',
      variants: 0,
    });
  });

  it('dữ liệu hỏng (không đúng định dạng) → bỏ qua, không hiển thị chuỗi lạ', () => {
    expect(shopifyCurrencyNotice({ foreignCurrency: 'usd<script>' })).toBeNull();
    expect(shopifyCurrencyNotice({ foreignCurrency: 5 })).toBeNull();
    expect(shopifyCurrencyNotice({ foreignCurrency: 'EUR', variantsWithoutPrice: -3 })).toEqual({
      currency: 'EUR',
      variants: 0,
    });
  });
});
