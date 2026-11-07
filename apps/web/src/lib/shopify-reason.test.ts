import { describe, expect, it } from 'vitest';
import { shopifyReasonKey } from './shopify-reason';

describe('shopifyReasonKey', () => {
  it.each([
    ['decrypt_failed', 'cannotDecrypt'],
    ['exchange:shopify_invalid_credentials:invalid_client', 'invalidClient'],
    ['exchange:shopify_invalid_credentials', 'exchangeRejected'],
    ['exchange:shopify_invalid_credentials:invalid_request', 'exchangeRejected'],
    ['exchange:shopify_not_permitted:shop_not_permitted', 'notPermitted'],
    ['exchange:shopify_not_permitted', 'notPermitted'],
    ['catalog:TOKEN_EXPIRED', 'catalogDenied'],
    ['catalog:PERMISSION', 'catalogDenied'],
    ['catalog:shopify_access_denied', 'catalogDenied'],
    ['catalog:shopify_forbidden', 'catalogDenied'],
    ['catalog:shopify_unauthorized', 'catalogDenied'],
    ['catalog:shopify_http_error', 'temporary'],
    ['exchange:RATE_LIMIT', 'rateLimited'],
    ['catalog:RATE_LIMIT', 'rateLimited'],
    ['exchange:UNKNOWN', 'temporary'],
    ['catalog:unknown', 'temporary'],
  ] as const)('%s → %s', (reason, expected) => {
    expect(shopifyReasonKey(reason)).toBe(expected);
  });

  it('không có / không nhận ra → null (giao diện dùng thông điệp chung)', () => {
    expect(shopifyReasonKey(undefined)).toBeNull();
    expect(shopifyReasonKey('')).toBeNull();
    expect(shopifyReasonKey('khong-biet')).toBeNull();
  });
});
