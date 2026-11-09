import { PlatformError, TokenDecryptError, TokenKeyMissingError } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { reasonOf, runShopifySync, type ShopifySyncDeps, scopeOf } from './shopify-sync';

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
  const fetchPolicies = vi
    .fn()
    .mockResolvedValue([
      { type: 'REFUND_POLICY', title: 'Hoàn tiền', body: '<p>7 ngày</p>', url: 'https://x/p' },
    ]);
  const applyPolicies = vi.fn().mockResolvedValue({ policiesUpdated: 1, policiesRemoved: 0 });
  const exchange = vi.fn().mockResolvedValue({
    accessToken: 'shpat_exchanged_token',
    scope: 'read_products,read_inventory',
  });
  const warn = vi.fn();
  const deps: ShopifySyncDeps = {
    enabled: true,
    workspaceId: 'w1',
    readCredentials: async () => STORED,
    decrypt: () => 'shpss_client_secret',
    exchange,
    fetchCatalog,
    fetchPolicies,
    applyPolicies,
    buildPlan: () => [],
    apply,
    record,
    warn,
    ...over,
  };
  return { deps, record, apply, fetchCatalog, warn, exchange, fetchPolicies, applyPolicies };
}

describe('scopeOf', () => {
  it('giữ chữ thường/số/_/, và lọc mọi ký tự lạ; cắt 300 ký tự', () => {
    expect(scopeOf('read_products,Read_Inventory')).toBe('read_products,read_inventory');
    expect(scopeOf('read_products <script>x</script>')).toBe('read_productsscriptxscript');
    expect(scopeOf('a'.repeat(500))).toHaveLength(300);
  });
});

describe('reasonOf', () => {
  it('ghép bước:mã, lọc ký tự lạ (không để lọt secret/dấu cách) và cắt tối đa 120 ký tự', () => {
    expect(reasonOf('exchange', 'shopify_invalid_credentials:invalid_client')).toBe(
      'exchange:shopify_invalid_credentials:invalid_client',
    );
    expect(reasonOf('catalog', 'có dấu & khoảng trắng')).toBe('catalog:c__d_u___kho_ng_tr_ng');
    expect(reasonOf('catalog', 'x'.repeat(300))).toHaveLength(120);
  });
});

describe('runShopifySync — tiền tệ khác VND (giữ giá gốc, không quy đổi; báo Owner)', () => {
  const planWith = (prices: Array<number | null>, foreign = true) =>
    [
      {
        externalId: 'p',
        variants: prices.map((price, i) =>
          foreign
            ? { externalId: `v${i}`, priceVnd: null, priceMinor: price }
            : { externalId: `v${i}`, priceVnd: price },
        ),
      },
    ] as never;

  it('cửa hàng USD → ghi foreignCurrency + số biến thể chưa đọc được giá; vẫn ok', async () => {
    const { deps, record } = setup({
      fetchCatalog: vi.fn().mockResolvedValue({ currencyCode: 'USD', products: [] }),
      buildPlan: () => planWith([1299, null, null]),
    });
    expect(await runShopifySync(deps)).toBe('ok');
    expect(record).toHaveBeenCalledWith(
      'ok',
      expect.objectContaining({ foreignCurrency: 'USD', variantsWithoutPrice: 2 }),
    );
  });

  it('mã tiền tệ lạ/không đúng 3 chữ cái hoa → ghi OTHER (không để lọt chuỗi tùy ý)', async () => {
    const { deps, record } = setup({
      fetchCatalog: vi.fn().mockResolvedValue({ currencyCode: 'usd<script>', products: [] }),
      buildPlan: () => planWith([null]),
    });
    await runShopifySync(deps);
    expect(record).toHaveBeenCalledWith(
      'ok',
      expect.objectContaining({ foreignCurrency: 'OTHER' }),
    );
  });

  it('cửa hàng VND → không có cảnh báo tiền tệ', async () => {
    const { deps, record } = setup({ buildPlan: () => planWith([150000, 99000], false) });
    await runShopifySync(deps);
    const detail = record.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(detail).not.toHaveProperty('foreignCurrency');
    expect(detail).not.toHaveProperty('variantsWithoutPrice');
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
    expect(record).toHaveBeenCalledWith('ok', {
      ...SUMMARY,
      policiesUpdated: 1,
      scope: 'read_products,read_inventory',
    });
  });

  it('chính sách: tải bằng token vừa đổi, đổi HTML sang văn bản thuần rồi nạp; ghi số mục đã cập nhật', async () => {
    const { deps, applyPolicies, fetchPolicies } = setup();
    await runShopifySync(deps);
    expect(fetchPolicies).toHaveBeenCalledWith('demo-shop.myshopify.com', 'shpat_exchanged_token');
    expect(applyPolicies).toHaveBeenCalledWith([
      { type: 'REFUND_POLICY', title: 'Hoàn tiền', content: '7 ngày' },
    ]);
  });

  it('chính sách lỗi (thiếu quyền read_legal_policies, mạng…) KHÔNG làm hỏng việc nạp sản phẩm: vẫn ok, đánh dấu bỏ qua', async () => {
    const { deps, record, apply, warn } = setup({
      fetchPolicies: async () => {
        throw new PlatformError('PERMISSION');
      },
    });
    expect(await runShopifySync(deps)).toBe('ok');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'ok',
      expect.objectContaining({ ...SUMMARY, policiesSkipped: true }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('read_legal_policies');
  });

  it('đề xuất chính sách có cấu trúc: gọi sau khi nạp chính sách, truyền văn bản thuần', async () => {
    const suggestPolicyFacts = vi.fn().mockResolvedValue(undefined);
    const { deps, applyPolicies } = setup({ suggestPolicyFacts });
    await runShopifySync(deps);
    expect(suggestPolicyFacts).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'REFUND_POLICY', content: '7 ngày' }),
    ]);
    expect(applyPolicies).toHaveBeenCalledTimes(1);
  });

  it('đề xuất lỗi KHÔNG làm hỏng việc nạp chính sách/sản phẩm: vẫn ok, chỉ cảnh báo, không đánh dấu bỏ qua chính sách', async () => {
    const { deps, record, warn } = setup({
      suggestPolicyFacts: async () => {
        throw new Error('boom');
      },
    });
    expect(await runShopifySync(deps)).toBe('ok');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'shopify_policy_suggestions_skipped' }),
    );
    expect(record).toHaveBeenCalledWith(
      'ok',
      expect.not.objectContaining({ policiesSkipped: true }),
    );
  });

  it('nạp chính sách vào DB lỗi → cũng chỉ bỏ qua chính sách', async () => {
    const { deps, record } = setup({
      applyPolicies: async () => {
        throw new Error('boom');
      },
    });
    expect(await runShopifySync(deps)).toBe('ok');
    expect(record).toHaveBeenCalledWith('ok', expect.objectContaining({ policiesSkipped: true }));
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
    expect(record).toHaveBeenCalledWith(expected, {
      reason: `catalog:${code}`,
      scope: 'read_products,read_inventory',
    });
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
    expect(record).toHaveBeenCalledWith('error', {
      reason: 'catalog:unknown',
      scope: 'read_products,read_inventory',
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('shpss_client_secret');
    expect(logged).not.toContain('shpat_exchanged_token');
    expect(logged).not.toContain('boom');
  });
});
