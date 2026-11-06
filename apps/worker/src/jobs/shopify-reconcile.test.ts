import { PlatformError, type ShopifyCatalog, type ShopifyConnector } from '@flow/connectors';
import type { FlowDb } from '@flow/db';
import { type InternalProductSnapshot, SHOPIFY_REQUIRED_WEBHOOK_TOPICS } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  createInMemoryReconcileStore,
  createShopifyReconcileHandler,
  type ShopifyReconcilePorts,
} from './shopify-reconcile';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-06T12:00:00Z');
const job = (data: unknown) => [{ id: 'j1', name: 'shopify-reconcile', data }] as never;

const catalog = (price: string): ShopifyCatalog => ({
  currencyCode: 'VND',
  products: [
    {
      id: 'gid://shopify/Product/1',
      title: 'Áo thun',
      handle: 'ao-thun',
      status: 'ACTIVE',
      productType: '',
      onlineStoreUrl: null,
      variants: [
        {
          id: 'gid://shopify/ProductVariant/11',
          sku: 'AT-1',
          title: 'Default Title',
          price,
          compareAtPrice: null,
          inventoryQuantity: 5,
          tracked: true,
          selectedOptions: [{ name: 'Title', value: 'Default Title' }],
        },
      ],
    },
  ],
});
const internal = (price: number): InternalProductSnapshot[] => [
  {
    externalId: 'gid://shopify/Product/1',
    name: 'Áo thun',
    variants: [
      {
        externalId: 'gid://shopify/ProductVariant/11',
        priceVnd: price,
        compareAtVnd: null,
        stock: 5,
      },
    ],
  },
];

function setup(
  over: {
    enabled?: boolean;
    price?: string;
    mine?: number;
    topics?: string[];
    connector?: Partial<ShopifyConnector> | null;
    register?: ShopifyReconcilePorts['registerWebhooks'];
    lastManualAt?: Date | null;
  } = {},
) {
  const store = createInMemoryReconcileStore();
  if (over.lastManualAt) store.seedRun(WS, { trigger: 'manual', at: over.lastManualAt });
  const withJob = vi.fn(async (workspaceId: string, fn: (t: unknown) => unknown) =>
    fn({ marker: 'tx', workspaceId }),
  );
  const db = { withJob } as unknown as FlowDb;
  const connector =
    over.connector === null
      ? null
      : {
          fetchCatalog: async () => catalog(over.price ?? '100000'),
          listWebhookSubscriptions: async () => over.topics ?? [...SHOPIFY_REQUIRED_WEBHOOK_TOPICS],
          ...over.connector,
        };
  const connectorFor = vi.fn(async () => connector as unknown as ShopifyConnector | null);
  const registerWebhooks = vi.fn(
    over.register ?? (async (_tx, _ws, topics: readonly string[]) => ({ registered: [...topics] })),
  );
  const notify = vi.fn(async () => undefined);
  const logger = { info: vi.fn(), error: vi.fn() };
  const handler = createShopifyReconcileHandler({
    db,
    enabled: over.enabled ?? true,
    ports: {
      connectorFor,
      loadInternal: async () => internal(over.mine ?? 100000),
      registerWebhooks,
      notify,
      ...store.ports,
    },
    now: () => NOW,
    logger,
  });
  return { handler, store, withJob, connectorFor, registerWebhooks, notify, logger };
}

describe('FR-112 job shopify-reconcile (mock)', () => {
  it('cờ tắt → không mở DB, không gọi Shopify', async () => {
    const t = setup({ enabled: false });
    await t.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    expect(t.withJob).not.toHaveBeenCalled();
    expect(t.connectorFor).not.toHaveBeenCalled();
  });

  it('dữ liệu job sai → ném lỗi kiểm dữ liệu', async () => {
    const t = setup();
    await expect(t.handler(job({ workspaceId: 'x', trigger: 'nightly' }))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('thiếu trigger → lỗi kiểm dữ liệu (không mặc định)', async () => {
    const t = setup();
    await expect(t.handler(job({ workspaceId: WS }))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('chạy trong withJob đúng workspace; khớp → ghi lần chạy 0 lệch, không báo', async () => {
    const t = setup();
    await t.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    expect(t.withJob).toHaveBeenCalledWith(WS, expect.any(Function));
    const run = t.store.runs(WS)[0];
    expect(run).toMatchObject({ trigger: 'nightly', at: NOW, error: null });
    expect(run?.result.summary.diffs).toBe(0);
    expect(t.notify).not.toHaveBeenCalled();
    expect(t.store.runs(OTHER)).toEqual([]);
  });

  it('lệch giá → ghi lệch để Owner duyệt (KHÔNG có ghi đè giá), báo Owner', async () => {
    const t = setup({ price: '120000' });
    await t.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    const run = t.store.runs(WS)[0];
    expect(run?.result.diffs[0]).toMatchObject({
      kind: 'price',
      internal: 100000,
      shopify: 120000,
    });
    expect(run?.result.needsOwnerReview).toBe(true);
    expect(t.notify).toHaveBeenCalledWith(WS, { kind: 'price_diffs', count: 1 });
  });

  it('thiếu webhook → đăng ký lại qua cổng, ghi nhận và báo Admin', async () => {
    const t = setup({ topics: ['PRODUCTS_UPDATE'] });
    await t.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    const missing = SHOPIFY_REQUIRED_WEBHOOK_TOPICS.filter((x) => x !== 'PRODUCTS_UPDATE');
    expect(t.registerWebhooks).toHaveBeenCalledWith(expect.anything(), WS, missing);
    expect(t.store.runs(WS)[0]).toMatchObject({
      webhookMissing: missing,
      webhookRegistered: missing,
    });
    expect(t.notify).toHaveBeenCalledWith(WS, {
      kind: 'admin_alert',
      webhookMissing: missing,
      diffRatioHigh: false,
    });
  });

  it('đăng ký lại webhook lỗi → vẫn ghi lần chạy, không ném, log không có nội dung lỗi', async () => {
    const t = setup({
      topics: [],
      register: async () => {
        throw new Error('secret-detail');
      },
    });
    await t.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    expect(t.store.runs(WS)[0]?.webhookRegistered).toEqual([]);
    expect(JSON.stringify(t.logger.error.mock.calls)).not.toContain('secret-detail');
  });

  it('thủ công trong vòng 1 giờ → từ chối, không gọi Shopify, không ghi lần chạy mới', async () => {
    const t = setup({ lastManualAt: new Date(NOW.getTime() - 10 * 60_000) });
    await t.handler(job({ workspaceId: WS, trigger: 'manual' }));
    expect(t.connectorFor).not.toHaveBeenCalled();
    expect(t.store.runs(WS)).toHaveLength(1);
  });

  it('thủ công sau hơn 1 giờ → chạy; chạy đêm không bị giới hạn bởi lần thủ công', async () => {
    const old = setup({ lastManualAt: new Date(NOW.getTime() - 61 * 60_000) });
    await old.handler(job({ workspaceId: WS, trigger: 'manual' }));
    expect(old.store.runs(WS)).toHaveLength(2);
    const recent = setup({ lastManualAt: new Date(NOW.getTime() - 60_000) });
    await recent.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    expect(recent.store.runs(WS)).toHaveLength(2);
  });

  it('chưa kết nối cửa hàng → bỏ qua, không ghi', async () => {
    const t = setup({ connector: null });
    await t.handler(job({ workspaceId: WS, trigger: 'nightly' }));
    expect(t.store.runs(WS)).toEqual([]);
    expect(t.logger.info).toHaveBeenCalled();
  });

  it('lỗi lấy dữ liệu (RATE_LIMIT) → ném để thử lại, KHÔNG ghi lần chạy dở', async () => {
    const t = setup({
      connector: {
        fetchCatalog: async () => {
          throw new PlatformError('RATE_LIMIT', { message: 'shopify_throttled' });
        },
      },
    });
    await expect(t.handler(job({ workspaceId: WS, trigger: 'nightly' }))).rejects.toBeInstanceOf(
      PlatformError,
    );
    expect(t.store.runs(WS)).toEqual([]);
  });

  it('báo thất bại → chỉ log, không làm job lỗi (lần chạy đã ghi)', async () => {
    const t = setup({ price: '120000' });
    t.notify.mockRejectedValueOnce(new Error('smtp'));
    await expect(t.handler(job({ workspaceId: WS, trigger: 'nightly' }))).resolves.toBeUndefined();
    expect(t.store.runs(WS)).toHaveLength(1);
    expect(t.logger.error).toHaveBeenCalled();
  });
});
