import { PlatformError, TokenDecryptError, TokenKeyMissingError } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { reasonOf, runShopifySync, type ShopifySyncDeps } from './shopify-sync';

const STORED = {
  shopDomain: 'demo-shop.myshopify.com',
  clientId: 'abcdef0123456789abcdef0123456789',
  ciphertext: Buffer.alloc(40),
  keyVersion: 1,
};
const CATALOG = { currencyCode: 'VND', products: [] };
const SUMMARY = { productsCreated: 2, productsUpdated: 1, variantsCreated: 4, variantsUpdated: 0 };

function setup(over: Partial<ShopifySyncDeps> = {}) {
  const record = vi.fn().mockResolvedValue(undefined);
  const apply = vi.fn().mockResolvedValue(SUMMARY);
  const fetchCatalog = vi.fn().mockResolvedValue(CATALOG);
  const exchange = vi.fn().mockResolvedValue('shpat_exchanged_token');
  const warn = vi.fn();
  const deps: ShopifySyncDeps = {
    enabled: true,
    workspaceId: 'w1',
    readCredentials: async () => STORED,
    decrypt: () => 'shpss_client_secret',
    exchange,
    fetchCatalog,
    buildPlan: () => [],
    apply,
    record,
    warn,
    ...over,
  };
  return { deps, record, apply, fetchCatalog, warn, exchange };
}

describe('reasonOf', () => {
  it('ghép bước:mã, lọc ký tự lạ (không để lọt secret/dấu cách) và cắt tối đa 120 ký tự', () => {
    expect(reasonOf('exchange', 'shopify_invalid_credentials:invalid_client')).toBe(
      'exchange:shopify_invalid_credentials:invalid_client',
    );
    expect(reasonOf('catalog', 'có dấu & khoảng trắng')).toBe('catalog:c__d_u___kho_ng_tr_ng');
    expect(reasonOf('catalog', 'x'.repeat(300))).toHaveLength(120);
  });
});

describe('runShopifySync', () => {
  it('thành công → nạp sản phẩm, ghi kết quả ok kèm số liệu', async () => {
    const { deps, record, apply, fetchCatalog, exchange } = setup();
    expect(await runShopifySync(deps)).toBe('ok');
    expect(exchange).toHaveBeenCalledWith(
      'demo-shop.myshopify.com',
      'abcdef0123456789abcdef0123456789',
      'shpss_client_secret',
    );
    expect(fetchCatalog).toHaveBeenCalledWith('demo-shop.myshopify.com', 'shpat_exchanged_token');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('ok', SUMMARY);
  });

  it('cờ tắt → unavailable, KHÔNG đọc thông tin xác thực, KHÔNG gọi Shopify', async () => {
    const readCredentials = vi.fn();
    const { deps, record, fetchCatalog } = setup({ enabled: false, readCredentials });
    expect(await runShopifySync(deps)).toBe('unavailable');
    expect(readCredentials).not.toHaveBeenCalled();
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith('unavailable', {});
  });

  it('không có kết nối/token → không làm gì (không ghi kết quả)', async () => {
    const { deps, record, fetchCatalog } = setup({ readCredentials: async () => null });
    expect(await runShopifySync(deps)).toBe('skipped');
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ['TOKEN_EXPIRED', 'token_invalid'],
    ['PERMISSION', 'token_invalid'],
    ['RATE_LIMIT', 'error'],
    ['UNKNOWN', 'error'],
  ] as const)('Shopify báo %s → %s; không nạp dữ liệu', async (code, expected) => {
    const { deps, record, apply } = setup({
      fetchCatalog: async () => {
        throw new PlatformError(code);
      },
    });
    expect(await runShopifySync(deps)).toBe(expected);
    expect(apply).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(expected, { reason: `catalog:${code}` });
  });

  it.each([
    ['TOKEN_EXPIRED', 'token_invalid'],
    ['PERMISSION', 'token_invalid'],
    ['RATE_LIMIT', 'error'],
  ] as const)(
    'đổi Client secret lấy token báo %s → %s; không gọi catalog',
    async (code, expected) => {
      const { deps, record, fetchCatalog } = setup({
        exchange: async () => {
          throw new PlatformError(code);
        },
      });
      expect(await runShopifySync(deps)).toBe(expected);
      expect(fetchCatalog).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledWith(expected, { reason: `exchange:${code}` });
    },
  );

  it('giải mã hỏng → token_invalid; thiếu khóa (lỗi cấu hình) → error, không hạ trạng thái', async () => {
    const bad = setup({
      decrypt: () => {
        throw new TokenDecryptError();
      },
    });
    expect(await runShopifySync(bad.deps)).toBe('token_invalid');
    expect(bad.record).toHaveBeenCalledWith('token_invalid', { reason: 'decrypt_failed' });
    const missing = setup({
      decrypt: () => {
        throw new TokenKeyMissingError(3);
      },
    });
    expect(await runShopifySync(missing.deps)).toBe('error');
  });

  it('lỗi khi ghi vào DB → error; log không chứa token hay nội dung lỗi', async () => {
    const { deps, record, warn } = setup({
      apply: async () => {
        throw new Error('boom shpss_client_secret');
      },
    });
    expect(await runShopifySync(deps)).toBe('error');
    expect(record).toHaveBeenCalledWith('error', { reason: 'catalog:unknown' });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('shpss_client_secret');
    expect(logged).not.toContain('shpat_exchanged_token');
    expect(logged).not.toContain('boom');
  });
});
