import { describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../errors';
import {
  createShopifyConnector,
  DEFAULT_SHOPIFY_API_VERSION,
  type ShopifyConnectorOptions,
} from './connector';
import {
  FAKE_TOKEN,
  jsonResponse,
  policiesResponse,
  productNode,
  productsPage,
  SHOP_DOMAIN,
  throttle,
  variantNode,
  variantsPage,
  webhooksResponse,
} from './fixtures';

type Call = {
  url: string;
  init: RequestInit;
  body: { query: string; variables: Record<string, unknown> };
};

function harness(responses: Array<Response | Error>, over: Partial<ShopifyConnectorOptions> = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body)) as Call['body'],
    });
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async (_ms: number) => undefined);
  const connector = createShopifyConnector({
    shopDomain: SHOP_DOMAIN,
    getAccessToken: async () => FAKE_TOKEN,
    fetch: fetchImpl as unknown as typeof fetch,
    sleep,
    ...over,
  });
  return { connector, calls, sleep };
}

const failureOf = async (promise: Promise<unknown>): Promise<PlatformError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PlatformError);
    return error as PlatformError;
  }
  throw new Error('không ném lỗi');
};

describe('FR-052 Shopify connector — cấu hình', () => {
  it.each([
    'evil.com',
    'demo-shop.myshopify.com.evil.com',
    'https://demo-shop.myshopify.com',
    '-a.myshopify.com',
    'a b.myshopify.com',
    '',
  ])('FR-052 từ chối domain lạ %j trước khi gọi mạng', (shopDomain) => {
    expect(() =>
      createShopifyConnector({ shopDomain, getAccessToken: async () => FAKE_TOKEN }),
    ).toThrow(/shopDomain/);
  });

  it('FR-052 từ chối phiên bản API sai dạng, pageSize/maxPages/timeout ngoài khoảng', () => {
    const base = { shopDomain: SHOP_DOMAIN, getAccessToken: async () => FAKE_TOKEN };
    expect(() => createShopifyConnector({ ...base, apiVersion: '2026-7' })).toThrow(/apiVersion/);
    expect(() => createShopifyConnector({ ...base, pageSize: 0 })).toThrow(/pageSize/);
    expect(() => createShopifyConnector({ ...base, pageSize: 26 })).toThrow(/pageSize/);
    expect(() => createShopifyConnector({ ...base, maxPages: 0 })).toThrow(/maxPages/);
    expect(() => createShopifyConnector({ ...base, timeoutMs: 0 })).toThrow(/timeoutMs/);
  });

  it('FR-052 gọi đúng endpoint đã ghim phiên bản, token chỉ ở header, không theo chuyển hướng, chỉ query', async () => {
    const { connector, calls } = harness([jsonResponse(productsPage([], null))]);
    await connector.fetchCatalog();
    const call = calls[0] as Call;
    expect(call.url).toBe(
      `https://${SHOP_DOMAIN}/admin/api/${DEFAULT_SHOPIFY_API_VERSION}/graphql.json`,
    );
    const headers = call.init.headers as Record<string, string>;
    expect(headers['X-Shopify-Access-Token']).toBe(FAKE_TOKEN);
    expect(call.init.method).toBe('POST');
    expect(call.init.redirect).toBe('error');
    expect(String(call.init.body)).not.toContain(FAKE_TOKEN);
    expect(call.body.query).not.toMatch(/mutation/i);
  });
});

describe('FR-052 Shopify connector — phân trang', () => {
  it('FR-052 duyệt hết sản phẩm qua nhiều trang bằng con trỏ after', async () => {
    const { connector, calls } = harness([
      jsonResponse(productsPage([productNode(1), productNode(2)], 'cur-1')),
      jsonResponse(productsPage([productNode(3)], null)),
    ]);
    const catalog = await connector.fetchCatalog();
    expect(catalog.currencyCode).toBe('VND');
    expect(catalog.products.map((p) => p.id)).toEqual([
      'gid://shopify/Product/1',
      'gid://shopify/Product/2',
      'gid://shopify/Product/3',
    ]);
    expect(calls[0]?.body.variables.after).toBeNull();
    expect(calls[1]?.body.variables.after).toBe('cur-1');
    expect(calls[0]?.body.variables.query).toBe('status:active');
  });

  it('FR-052 biến thể > 100/sản phẩm được lấy tiếp bằng truy vấn riêng', async () => {
    const big = productNode(1, {
      variants: {
        pageInfo: { hasNextPage: true, endCursor: 'v-1' },
        nodes: [variantNode(11)],
      },
    });
    const { connector, calls } = harness([
      jsonResponse(productsPage([big], null)),
      jsonResponse(variantsPage([variantNode(12)], 'v-2')),
      jsonResponse(variantsPage([variantNode(13)], null)),
    ]);
    const catalog = await connector.fetchCatalog();
    expect(catalog.products[0]?.variants.map((v) => v.sku)).toEqual(['SKU-11', 'SKU-12', 'SKU-13']);
    expect(calls[1]?.body.variables).toMatchObject({ id: 'gid://shopify/Product/1', after: 'v-1' });
    expect(calls[2]?.body.variables).toMatchObject({ after: 'v-2' });
  });

  it('FR-052 vượt maxPages → lỗi, không trả danh mục dang dở', async () => {
    const { connector } = harness(
      [
        jsonResponse(productsPage([productNode(1)], 'a')),
        jsonResponse(productsPage([productNode(2)], 'b')),
      ],
      { maxPages: 2 },
    );
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('shopify_too_many_pages');
  });

  it('FR-052 biến thể phân trang vô hạn cũng bị chặn bởi maxPages', async () => {
    const big = productNode(1, {
      variants: { pageInfo: { hasNextPage: true, endCursor: 'v' }, nodes: [variantNode(11)] },
    });
    const { connector } = harness(
      [
        jsonResponse(productsPage([big], null)),
        jsonResponse(variantsPage([variantNode(12)], 'v2')),
      ],
      { maxPages: 1 },
    );
    expect((await failureOf(connector.fetchCatalog())).message).toBe('shopify_too_many_pages');
  });

  it('FR-052 sản phẩm không còn (node null) khi lấy biến thể → bỏ qua phần còn lại', async () => {
    const big = productNode(1, {
      variants: { pageInfo: { hasNextPage: true, endCursor: 'v' }, nodes: [variantNode(11)] },
    });
    const { connector } = harness([
      jsonResponse(productsPage([big], null)),
      jsonResponse({ data: { node: null }, extensions: throttle(1900) }),
    ]);
    const catalog = await connector.fetchCatalog();
    expect(catalog.products[0]?.variants).toHaveLength(1);
  });

  it('FR-052 đọc chính sách cửa hàng, bỏ chính sách rỗng', async () => {
    const { connector } = harness([jsonResponse(policiesResponse)]);
    expect(await connector.fetchPolicies()).toEqual([
      {
        type: 'REFUND_POLICY',
        title: 'Chính sách đổi trả',
        body: '<p>Đổi trả trong 7 ngày.</p>',
        url: 'https://demo-shop.myshopify.com/policies/refund-policy',
      },
    ]);
  });

  it('FR-113 đọc chủ đề webhook đã đăng ký (chỉ query, không mutation), loại trùng', async () => {
    const { connector, calls } = harness([jsonResponse(webhooksResponse)]);
    expect(await connector.listWebhookSubscriptions()).toEqual([
      'PRODUCTS_UPDATE',
      'PRODUCTS_DELETE',
    ]);
    expect(calls[0]?.body.query).toContain('webhookSubscriptions');
    expect(calls[0]?.body.query).not.toContain('mutation');
  });

  it('FR-113 webhook: dùng chung xử lý lỗi (401 → TOKEN_EXPIRED) và chặn hình dạng sai', async () => {
    const unauthorized = harness([jsonResponse({}, { status: 401 })]);
    expect((await failureOf(unauthorized.connector.listWebhookSubscriptions())).code).toBe(
      'TOKEN_EXPIRED',
    );
    const bad = harness([jsonResponse({ data: { webhookSubscriptions: {} } })]);
    expect((await failureOf(bad.connector.listWebhookSubscriptions())).code).toBe('UNKNOWN');
  });
});

describe('FR-052 Shopify connector — giới hạn tốc độ và lỗi', () => {
  it('FR-052 chủ động chờ khi điểm còn lại thấp (sleep tiêm vào)', async () => {
    const { connector, sleep } = harness([
      jsonResponse(productsPage([productNode(1)], 'c', 2)), // còn 2 điểm, truy vấn tốn 12, hồi 100/giây
      jsonResponse(productsPage([], null)),
    ]);
    await connector.fetchCatalog();
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100); // (12-2)/100 giây = 100ms
  });

  it('FR-052 không tiêm sleep → dùng setTimeout thật (giả lập bằng fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const { connector } = harness(
        [
          jsonResponse(productsPage([productNode(1)], 'c', 2)),
          jsonResponse(productsPage([], null)),
        ],
        { sleep: undefined },
      );
      const pending = connector.fetchCatalog();
      await vi.advanceTimersByTimeAsync(100);
      expect((await pending).products).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('FR-052 phải chờ quá 60 giây → RATE_LIMIT thay vì ngủ', async () => {
    const slow = productsPage([productNode(1)], 'c', 0);
    slow.extensions.cost.throttleStatus.restoreRate = 1;
    slow.extensions.cost.requestedQueryCost = 100;
    const { connector, sleep } = harness([jsonResponse(slow)]);
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.retryAfterSeconds).toBe(100);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('FR-052 không chờ khi còn đủ điểm', async () => {
    const { connector, sleep } = harness([
      jsonResponse(productsPage([productNode(1)], 'c', 1900)),
      jsonResponse(productsPage([], null)),
    ]);
    await connector.fetchCatalog();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('FR-052 phản hồi không có thông tin throttle thì không chờ', async () => {
    const { connector, sleep } = harness([
      jsonResponse({ ...productsPage([productNode(1)], 'c'), extensions: undefined }),
      jsonResponse(productsPage([], null)),
    ]);
    await connector.fetchCatalog();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('FR-052 THROTTLED trong errors → RATE_LIMIT có retryAfterSeconds', async () => {
    const { connector } = harness([
      jsonResponse({
        errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
        extensions: throttle(0, 1000),
      }),
    ]);
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.retryAfterSeconds).toBe(10); // 1000 điểm / 100 mỗi giây
  });

  it('FR-052 THROTTLED không kèm throttleStatus → mặc định 2 giây', async () => {
    const { connector } = harness([
      jsonResponse({ errors: [{ extensions: { code: 'THROTTLED' } }] }),
    ]);
    expect((await failureOf(connector.fetchCatalog())).retryAfterSeconds).toBe(2);
  });

  it('FR-052 HTTP 429 → RATE_LIMIT theo Retry-After (có chặn trần)', async () => {
    const { connector } = harness([
      jsonResponse({}, { status: 429, headers: { 'retry-after': '7.5' } }),
      jsonResponse({}, { status: 429, headers: { 'retry-after': '999999' } }),
      jsonResponse({}, { status: 429 }),
    ]);
    expect((await failureOf(connector.fetchCatalog())).retryAfterSeconds).toBe(8);
    expect((await failureOf(connector.fetchCatalog())).retryAfterSeconds).toBe(86_400);
    const noHeader = await failureOf(connector.fetchCatalog());
    expect(noHeader.code).toBe('RATE_LIMIT');
    expect(noHeader.retryAfterSeconds).toBeUndefined();
  });

  it.each([
    [401, 'TOKEN_EXPIRED'],
    [402, 'PERMISSION'],
    [403, 'PERMISSION'],
    [404, 'UNKNOWN'],
    [500, 'UNKNOWN'],
  ])('FR-052 HTTP %i → %s, thông báo không chứa token/URL', async (status, code) => {
    const { connector } = harness([jsonResponse({ errors: 'x' }, { status })]);
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(FAKE_TOKEN);
    expect(error.message).not.toContain(SHOP_DOMAIN);
  });

  it('FR-052 ACCESS_DENIED trong errors → PERMISSION; lỗi GraphQL khác → UNKNOWN', async () => {
    const { connector } = harness([
      jsonResponse({ errors: [{ extensions: { code: 'ACCESS_DENIED' } }] }),
      jsonResponse({ errors: [{ message: 'boom' }] }),
      jsonResponse({ errors: [] }),
    ]);
    expect((await failureOf(connector.fetchCatalog())).code).toBe('PERMISSION');
    const other = await failureOf(connector.fetchCatalog());
    expect(other.code).toBe('UNKNOWN');
    expect(other.message).toBe('shopify_graphql_error');
    expect((await failureOf(connector.fetchCatalog())).message).toBe('shopify_bad_response');
  });

  it('FR-052 phản hồi sai hình dạng / không phải JSON / lỗi mạng → UNKNOWN, không rò nội dung', async () => {
    const { connector } = harness([
      jsonResponse({ data: { shop: {}, products: 1 } }),
      new Response('<html>tt-test</html>', { status: 200 }),
      new Error('ECONNRESET demo-shop.myshopify.com tt-test'),
    ]);
    for (const message of [
      'shopify_bad_response',
      'shopify_bad_response',
      'shopify_network_error',
    ]) {
      const error = await failureOf(connector.fetchCatalog());
      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe(message);
      expect(error.message).not.toContain(FAKE_TOKEN);
    }
  });

  it('FR-052 thân phản hồi quá lớn bị chặn theo Content-Length lẫn theo byte nhận', async () => {
    const huge = 'x'.repeat(9 * 1024 * 1024);
    const { connector } = harness([
      jsonResponse({}, { headers: { 'content-length': String(9 * 1024 * 1024) } }),
      new Response(huge, { status: 200 }),
    ]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('shopify_bad_response');
    expect((await failureOf(connector.fetchCatalog())).message).toBe('shopify_bad_response');
  });

  it('FR-052 phản hồi không có thân → lỗi phản hồi hỏng', async () => {
    const { connector } = harness([new Response(null, { status: 200 })]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('shopify_bad_response');
  });

  it('FR-052 token không lấy được → TOKEN_EXPIRED, không gọi mạng', async () => {
    const { connector, calls } = harness([], {
      getAccessToken: async () => {
        throw new Error('vault down');
      },
    });
    expect((await failureOf(connector.fetchCatalog())).code).toBe('TOKEN_EXPIRED');
    expect(calls).toHaveLength(0);
  });

  it('FR-052 PlatformError từ nhà cung cấp token được giữ nguyên', async () => {
    const { connector } = harness([], {
      getAccessToken: async () => {
        throw new PlatformError('PERMISSION');
      },
    });
    expect((await failureOf(connector.fetchPolicies())).code).toBe('PERMISSION');
  });

  it('FR-052 chính sách dùng chung xử lý lỗi', async () => {
    const { connector } = harness([jsonResponse({}, { status: 401 })]);
    expect((await failureOf(connector.fetchPolicies())).code).toBe('TOKEN_EXPIRED');
  });
});
