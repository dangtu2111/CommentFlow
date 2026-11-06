import { describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../errors';
import { createHaravanConnector, type HaravanConnectorOptions } from './connector';
import { FAKE_TOKEN, jsonResponse, productNode, productsPage, variantNode } from './fixtures';

type Call = { url: URL; init: RequestInit };

function harness(responses: Array<Response | Error>, over: Partial<HaravanConnectorOptions> = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async (_ms: number) => undefined);
  const connector = createHaravanConnector({
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

const page = (nodes: unknown[], limitHeader?: string) =>
  jsonResponse(
    productsPage(nodes),
    limitHeader === undefined ? {} : { headers: { 'X-Haravan-Api-Call-Limit': limitHeader } },
  );

describe('FR-122 createHaravanConnector — cấu hình', () => {
  it.each([0, 251, 1.5])('pageSize không hợp lệ (%s) bị từ chối', (pageSize) => {
    expect(() =>
      createHaravanConnector({ getAccessToken: async () => FAKE_TOKEN, pageSize }),
    ).toThrow();
  });
  it('maxPages/timeoutMs không hợp lệ bị từ chối', () => {
    const base = { getAccessToken: async () => FAKE_TOKEN };
    expect(() => createHaravanConnector({ ...base, maxPages: 0 })).toThrow();
    expect(() => createHaravanConnector({ ...base, timeoutMs: 0 })).toThrow();
  });
});

describe('FR-122 Haravan fetchCatalog', () => {
  it('GET đúng máy chủ Omni API, token Bearer ở header, không theo redirect', async () => {
    const { connector, calls } = harness([page([productNode(1)])]);
    const catalog = await connector.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(calls).toHaveLength(1);
    const call = calls[0] as Call;
    expect(`${call.url.origin}${call.url.pathname}`).toBe(
      'https://apis.haravan.com/com/products.json',
    );
    expect(call?.url.searchParams.get('page')).toBe('1');
    expect(call?.url.searchParams.get('published_status')).toBe('published');
    expect(call?.init.method).toBe('GET');
    expect(call?.init.redirect).toBe('error');
    const headers = (call?.init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(call?.url.href).not.toContain(FAKE_TOKEN);
  });

  it('phân trang đến khi trang ngắn hơn limit và loại trùng theo id', async () => {
    const { connector, calls } = harness(
      [page([productNode(1), productNode(2)]), page([productNode(2), productNode(3)]), page([])],
      { pageSize: 2 },
    );
    const catalog = await connector.fetchCatalog();
    expect(catalog.products.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(calls.map((c) => c.url.searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(calls[0]?.url.searchParams.get('limit')).toBe('2');
  });

  it('chuẩn hóa hình dạng sản phẩm/biến thể (giá số hoặc chuỗi, tùy chọn)', async () => {
    const node = productNode(7, {
      variants: [
        variantNode(71, { price: '99000.00', compare_at_price: '120000', option2: 'M' }),
        variantNode(72, { inventory_management: null, inventory_quantity: 5, sku: '' }),
      ],
      options: [
        { name: 'Màu', position: 1 },
        { name: 'Size', position: 2 },
      ],
    });
    const { connector } = harness([page([node])]);
    const [product] = (await connector.fetchCatalog()).products;
    expect(product).toMatchObject({
      id: '7',
      title: 'Áo thun 7',
      productType: 'Áo',
      published: true,
      optionNames: ['Màu', 'Size'],
    });
    expect(product?.url).toBeNull();
    expect(product?.variants[0]).toMatchObject({
      id: '71',
      price: '99000.00',
      compareAtPrice: '120000',
      managed: true,
      optionValues: ['Mau 71', 'M', null],
    });
    expect(product?.variants[1]).toMatchObject({ managed: false, sku: null });
  });

  it('chưa xuất bản (published_at null) → published=false', async () => {
    const { connector } = harness([page([productNode(1, { published_at: null })])]);
    expect((await connector.fetchCatalog()).products[0]?.published).toBe(false);
  });

  it('vượt maxPages → lỗi, không trả danh mục dang dở', async () => {
    const { connector } = harness([page([productNode(1)]), page([productNode(2)])], {
      pageSize: 1,
      maxPages: 2,
    });
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('haravan_too_many_pages');
  });

  it('phản hồi sai hình dạng / JSON hỏng → UNKNOWN haravan_bad_response', async () => {
    for (const bad of [jsonResponse({ products: [{ id: 1 }] }), new Response('<html>')]) {
      const { connector } = harness([bad]);
      expect((await failureOf(connector.fetchCatalog())).message).toBe('haravan_bad_response');
    }
  });

  it('lỗi mạng → UNKNOWN, không lộ token', async () => {
    const { connector } = harness([new Error(`boom ${FAKE_TOKEN}`)]);
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('haravan_network_error');
    expect(JSON.stringify(error)).not.toContain(FAKE_TOKEN);
  });

  it.each([
    [401, 'TOKEN_EXPIRED'],
    [403, 'PERMISSION'],
    [429, 'RATE_LIMIT'],
    [500, 'UNKNOWN'],
  ])('HTTP %s → %s', async (status, code) => {
    const { connector } = harness([new Response('x', { status })]);
    expect((await failureOf(connector.fetchCatalog())).code).toBe(code);
  });

  it('429 mang Retry-After (có chặn trần)', async () => {
    const { connector } = harness([
      new Response('x', { status: 429, headers: { 'retry-after': '2.5' } }),
    ]);
    expect((await failureOf(connector.fetchCatalog())).retryAfterSeconds).toBe(3);
  });

  it('token không lấy được → TOKEN_EXPIRED, chưa gọi mạng', async () => {
    const { connector, calls } = harness([], {
      getAccessToken: async () => {
        throw new Error('kho token hỏng');
      },
    });
    expect((await failureOf(connector.fetchCatalog())).code).toBe('TOKEN_EXPIRED');
    expect(calls).toHaveLength(0);
  });

  it('bucket gần đầy (X-Haravan-Api-Call-Limit) → chờ trước lần gọi sau', async () => {
    const { connector, sleep } = harness(
      [page([productNode(1), productNode(2)], '80/80'), page([])],
      { pageSize: 2 },
    );
    await connector.fetchCatalog();
    expect(sleep).toHaveBeenCalledTimes(1);
    const waited = sleep.mock.calls[0]?.[0] as number;
    expect(waited).toBeGreaterThan(0);
    expect(waited).toBeLessThanOrEqual(60_000);
  });

  it('thân phản hồi quá lớn (khai báo hoặc thực tế) → haravan_bad_response', async () => {
    const declared = new Response('{}', {
      headers: { 'content-length': String(64 * 1024 * 1024) },
    });
    const streamed = new Response(new Uint8Array(17 * 1024 * 1024));
    for (const response of [declared, streamed]) {
      const { connector } = harness([response]);
      expect((await failureOf(connector.fetchCatalog())).message).toBe('haravan_bad_response');
    }
  });

  it('thân rỗng (không body) → haravan_bad_response', async () => {
    const { connector } = harness([new Response(null, { status: 200 })]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('haravan_bad_response');
  });

  it('bucket báo kẹt quá lâu → RATE_LIMIT kèm retryAfterSeconds, không ngủ giữ job', async () => {
    const { connector, sleep } = harness([page([productNode(1)], '999999/80')], { pageSize: 1 });
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.message).toBe('haravan_throttled');
    expect(error.retryAfterSeconds).toBeGreaterThan(60);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('Retry-After hỏng/âm → không có gợi ý', async () => {
    for (const value of ['abc', '-3']) {
      const { connector } = harness([
        new Response('x', { status: 429, headers: { 'retry-after': value } }),
      ]);
      expect((await failureOf(connector.fetchCatalog())).retryAfterSeconds).toBeUndefined();
    }
  });

  it('getAccessToken ném PlatformError → giữ nguyên mã', async () => {
    const { connector } = harness([], {
      getAccessToken: async () => {
        throw new PlatformError('PERMISSION', { message: 'kho_token_cam' });
      },
    });
    expect((await failureOf(connector.fetchCatalog())).code).toBe('PERMISSION');
  });

  it('không tiêm sleep → dùng setTimeout thật (giả lập đồng hồ) khi bucket đầy', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(page([productNode(1)], '82/80'))
        .mockResolvedValueOnce(page([]));
      const connector = createHaravanConnector({
        getAccessToken: async () => FAKE_TOKEN,
        fetch: fetchImpl as unknown as typeof fetch,
        pageSize: 1,
      });
      const promise = connector.fetchCatalog();
      await vi.advanceTimersByTimeAsync(2_000);
      expect((await promise).products).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bucket còn nhiều chỗ hoặc header hỏng → không chờ', async () => {
    for (const header of ['3/80', 'rác', undefined]) {
      const { connector, sleep } = harness([page([productNode(1)], header), page([])], {
        pageSize: 1,
      });
      await connector.fetchCatalog();
      expect(sleep).not.toHaveBeenCalled();
    }
  });
});
