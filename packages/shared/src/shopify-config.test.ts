import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOPIFY_API_VERSION, readShopifyConfig } from './shopify-config';

describe('FR-052 cấu hình Shopify (cờ mặc định tắt)', () => {
  it('FR-052 không đặt biến → tắt, phiên bản mặc định', () => {
    expect(readShopifyConfig({})).toEqual({
      enabled: false,
      apiVersion: DEFAULT_SHOPIFY_API_VERSION,
    });
  });

  it.each(['', 'TRUE', 'True', '1', 'yes', ' true', 'false'])(
    'FR-052 SHOPIFY_ENABLED=%j → vẫn tắt (chỉ đúng chữ `true` mới bật)',
    (value) => {
      expect(readShopifyConfig({ SHOPIFY_ENABLED: value }).enabled).toBe(false);
    },
  );

  it('FR-052 SHOPIFY_ENABLED=true → bật, đọc phiên bản đã ghim', () => {
    expect(readShopifyConfig({ SHOPIFY_ENABLED: 'true', SHOPIFY_API_VERSION: '2026-10' })).toEqual({
      enabled: true,
      apiVersion: '2026-10',
    });
  });

  it('FR-052 phiên bản trống → mặc định; sai dạng khi bật → lỗi rõ ràng; khi tắt → bỏ qua', () => {
    expect(readShopifyConfig({ SHOPIFY_ENABLED: 'true', SHOPIFY_API_VERSION: '' }).apiVersion).toBe(
      DEFAULT_SHOPIFY_API_VERSION,
    );
    expect(() =>
      readShopifyConfig({ SHOPIFY_ENABLED: 'true', SHOPIFY_API_VERSION: 'unstable' }),
    ).toThrow(/SHOPIFY_API_VERSION/);
    expect(readShopifyConfig({ SHOPIFY_API_VERSION: 'unstable' }).enabled).toBe(false);
  });
});
