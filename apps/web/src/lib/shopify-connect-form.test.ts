import { describe, expect, it } from 'vitest';
import {
  parseShopifyClientId,
  parseShopifyClientSecret,
  parseShopifyDomain,
} from './shopify-connect-form';

describe('parseShopifyDomain', () => {
  it.each([
    ['demo-shop.myshopify.com', 'demo-shop.myshopify.com'],
    ['  Demo-Shop.MyShopify.com  ', 'demo-shop.myshopify.com'],
    ['https://demo-shop.myshopify.com', 'demo-shop.myshopify.com'],
    ['https://demo-shop.myshopify.com/admin/products?x=1', 'demo-shop.myshopify.com'],
    ['demo-shop.myshopify.com/', 'demo-shop.myshopify.com'],
    ['demo-shop', 'demo-shop.myshopify.com'],
  ])('chuẩn hóa %j → %s', (input, expected) => {
    expect(parseShopifyDomain(input)).toBe(expected);
  });

  it.each([
    '',
    'evil.com',
    'demo-shop.myshopify.com.evil.com',
    'http://demo-shop.myshopify.com',
    'https://user:pass@demo-shop.myshopify.com',
    'https://demo-shop.myshopify.com@evil.com',
    '-bad.myshopify.com',
    'demo shop.myshopify.com',
    'a'.repeat(80) + '.myshopify.com',
    '192.168.0.1',
    'evil.com/demo-shop.myshopify.com',
  ])('từ chối %j (chặn SSRF/giả mạo)', (input) => {
    expect(parseShopifyDomain(input)).toBeNull();
  });
});

describe('parseShopifyClientId', () => {
  it('nhận Client ID hợp lệ, cắt khoảng trắng hai đầu', () => {
    expect(parseShopifyClientId('  abcdef0123456789abcdef0123456789  ')).toBe(
      'abcdef0123456789abcdef0123456789',
    );
  });

  it.each(['', 'ngan', 'co khoang trang 0123456789', 'x'.repeat(101), 'có-dấu-0123456789'])(
    'từ chối %j',
    (input) => {
      expect(parseShopifyClientId(input)).toBeNull();
    },
  );
});

describe('parseShopifyClientSecret', () => {
  it('nhận Client secret hợp lệ, cắt khoảng trắng hai đầu', () => {
    expect(parseShopifyClientSecret('  shpss_unit_secret_value  ')).toBe('shpss_unit_secret_value');
  });

  it.each([
    '',
    'ngắn',
    'có khoảng trắng ở giữa secret secret',
    'x'.repeat(201),
    'shpss_\nxuống dòng',
  ])('từ chối %j', (input) => {
    expect(parseShopifyClientSecret(input)).toBeNull();
  });
});
