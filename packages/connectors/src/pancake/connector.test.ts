import { describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../errors';
import { createPancakeConnector, type PancakeConnectorOptions } from './connector';
import {
  FAKE_API_KEY,
  FAKE_SHOP_ID,
  jsonResponse,
  productNode,
  productsPage,
  variationNode,
} from './fixtures';

type Call = { url: URL; init: RequestInit };

const BASE = { shopId: FAKE_SHOP_ID, getApiKey: async () => FAKE_API_KEY };

function harness(responses: Array<Response | Error>, over: Partial<PancakeConnectorOptions> = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    if (next instanceof Error) throw next;
    return next;
  });
  const connector = createPancakeConnector({
    ...BASE,
    fetch: fetchImpl as unknown as typeof fetch,
    ...over,
  });
  return { connector, calls };
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

const page = (nodes: unknown[], over: Parameters<typeof productsPage>[1] = {}) =>
  jsonResponse(productsPage(nodes, over));

describe('FR-122 createPancakeConnector — cấu hình', () => {
  it.each([0, 101, 1.5])('pageSize không hợp lệ (%s) bị từ chối', (pageSize) => {
    expect(() => createPancakeConnector({ ...BASE, pageSize })).toThrow();
  });
  it('maxPages/timeoutMs không hợp lệ bị từ chối', () => {
    expect(() => createPancakeConnector({ ...BASE, maxPages: 0 })).toThrow();
    expect(() => createPancakeConnector({ ...BASE, timeoutMs: 0 })).toThrow();
    expect(() => createPancakeConnector({ ...BASE, timeoutMs: 60_001 })).toThrow();
  });
  it.each(['', 'a b', '12/../3', '12?x=1', '12\r\n', 'abc', '1'.repeat(21)])(
    'mã shop không hợp lệ (%j) bị từ chối — chặn chèn đường dẫn',
    (shopId) => {
      expect(() => createPancakeConnector({ ...BASE, shopId })).toThrow(/shopId/);
    },
  );
});

describe('FR-122 Pancake fetchCatalog', () => {
  it('GET máy chủ cố định, khóa chỉ ở api_key, không theo redirect', async () => {
    const { connector, calls } = harness([page([productNode(1)])]);
    const catalog = await connector.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(calls).toHaveLength(1);
    const call = calls[0] as Call;
    expect(`${call.url.origin}${call.url.pathname}`).toBe(
      `https://pos.pages.fm/api/v1/shops/${FAKE_SHOP_ID}/products`,
    );
    expect(call.url.searchParams.get('page_number')).toBe('1');
    expect(call.url.searchParams.get('page_size')).toBe('100');
    expect(call.url.searchParams.get('api_key')).toBe(FAKE_API_KEY);
    expect(call.init.method).toBe('GET');
    expect(call.init.redirect).toBe('error');
    expect(JSON.stringify(call.init.headers)).not.toContain(FAKE_API_KEY);
  });

  it('giữ id/tên/danh mục/SKU/giá/tồn/thuộc tính của biến thể', async () => {
    const { connector } = harness([
      page([
        productNode(1, {
          variations: [
            variationNode(1, {
              custom_id: 'AT-01',
              retail_price: 199000,
              remain_quantity: 7,
              fields: [
                { name: 'Màu', value: 'Đỏ' },
                { name: 'Size', value: '' },
                { name: '', value: 'x' },
                { name: 'Chất liệu', value: null },
              ],
            }),
          ],
        }),
      ]),
    ]);
    const { products } = await connector.fetchCatalog();
    expect(products[0]).toEqual({
      id: 'prod-1',
      title: 'Áo thun 1',
      category: 'Áo',
      published: true,
      url: null,
      variants: [
        {
          id: 'var-1',
          sku: 'AT-01',
          price: 199000,
          quantity: 7,
          attrs: { Màu: 'Đỏ' },
          sellable: true,
        },
      ],
    });
  });

  it('thiếu trường tùy chọn → null/rỗng, không bịa', async () => {
    const { connector } = harness([
      page([
        {
          id: 9,
          name: 'Trơn',
          variations: [{ id: 90, custom_id: '', retail_price: null, remain_quantity: null }],
        },
      ]),
    ]);
    const { products } = await connector.fetchCatalog();
    expect(products[0]).toMatchObject({ id: '9', category: '', published: true });
    expect(products[0]?.variants[0]).toEqual({
      id: '90',
      sku: null,
      price: null,
      quantity: null,
      attrs: {},
      sellable: true,
    });
  });

  it('sản phẩm/biến thể ẩn → published/sellable = false', async () => {
    const { connector } = harness([
      page([
        productNode(1, { is_hidden: true }),
        productNode(2, { variations: [variationNode(2, { is_hidden: true })] }),
      ]),
    ]);
    const { products } = await connector.fetchCatalog();
    expect(products[0]?.published).toBe(false);
    expect(products[1]?.variants[0]?.sellable).toBe(false);
  });

  it('lấy danh mục đầu tiên có tên', async () => {
    const { connector } = harness([
      page([
        productNode(1, {
          categories: [
            { id: 1, name: '' },
            { id: 2, name: 'Quần' },
          ],
        }),
      ]),
    ]);
    expect((await connector.fetchCatalog()).products[0]?.category).toBe('Quần');
  });

  it('phân trang theo page_number đến total_pages, loại trùng id', async () => {
    const { connector, calls } = harness(
      [
        page([productNode(1), productNode(2)], { page: 1, totalPages: 2 }),
        page([productNode(2), productNode(3)], { page: 2, totalPages: 2 }),
      ],
      { pageSize: 2 },
    );
    const { products } = await connector.fetchCatalog();
    expect(products.map((p) => p.id)).toEqual(['prod-1', 'prod-2', 'prod-3']);
    expect(calls.map((c) => c.url.searchParams.get('page_number'))).toEqual(['1', '2']);
  });

  it('dừng khi trang ngắn dù thiếu total_pages', async () => {
    const { connector, calls } = harness([jsonResponse({ data: [productNode(1)] })]);
    expect((await connector.fetchCatalog()).products).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('trang trống khi còn trang sau → lỗi, không trả danh mục dang dở', async () => {
    const { connector } = harness(
      [
        page([productNode(1), productNode(2)], { totalPages: 5 }),
        page([], { page: 2, totalPages: 5 }),
      ],
      { pageSize: 2 },
    );
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_bad_response');
  });

  it('id số vượt 2^53 → pancake_bad_response', async () => {
    const { connector } = harness([
      new Response('{"data":[{"id":1e300,"name":"A"}]}', { status: 200 }),
    ]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_bad_response');
  });

  it('trang trống ở trang cuối/không có total_pages → dừng bình thường', async () => {
    const { connector } = harness([jsonResponse({ data: [] })]);
    expect((await connector.fetchCatalog()).products).toEqual([]);
  });

  it('trang đầy mà không có dòng mới (API bỏ qua page_number) → lỗi', async () => {
    const same = [productNode(1), productNode(2)];
    const { connector } = harness([page(same, { totalPages: 9 }), page(same, { totalPages: 9 })], {
      pageSize: 2,
    });
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_bad_response');
  });

  it('vượt maxPages → lỗi, không trả danh mục dang dở', async () => {
    const { connector } = harness(
      [page([productNode(1)], { totalPages: 9 }), page([productNode(2)], { totalPages: 9 })],
      { pageSize: 1, maxPages: 2 },
    );
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_too_many_pages');
  });

  it.each([
    [401, 'TOKEN_EXPIRED', 'pancake_unauthorized'],
    [403, 'PERMISSION', 'pancake_forbidden'],
    [429, 'RATE_LIMIT', 'pancake_rate_limited'],
    [500, 'UNKNOWN', 'pancake_http_error'],
  ])('HTTP %s → %s, không lộ khóa', async (status, code, message) => {
    const { connector } = harness([new Response('lỗi', { status })]);
    const failure = await failureOf(connector.fetchCatalog());
    expect(failure.code).toBe(code);
    expect(failure.message).toBe(message);
    expect(JSON.stringify(failure)).not.toContain(FAKE_API_KEY);
  });

  it('429 mang Retry-After (giây, làm tròn lên, có trần)', async () => {
    const a = harness([new Response('', { status: 429, headers: { 'retry-after': '1.2' } })]);
    expect((await failureOf(a.connector.fetchCatalog())).retryAfterSeconds).toBe(2);
    const b = harness([new Response('', { status: 429, headers: { 'retry-after': '999999' } })]);
    expect((await failureOf(b.connector.fetchCatalog())).retryAfterSeconds).toBe(86_400);
    const c = harness([new Response('', { status: 429, headers: { 'retry-after': 'abc' } })]);
    expect((await failureOf(c.connector.fetchCatalog())).retryAfterSeconds).toBeUndefined();
  });

  it('lỗi mạng → pancake_network_error (không kèm URL có khóa)', async () => {
    const { connector } = harness([new Error(`fail https://x?api_key=${FAKE_API_KEY}`)]);
    const failure = await failureOf(connector.fetchCatalog());
    expect(failure.message).toBe('pancake_network_error');
    expect(JSON.stringify(failure)).not.toContain(FAKE_API_KEY);
  });

  it('thân không phải JSON / sai hình dạng / success=false → pancake_bad_response', async () => {
    for (const res of [
      new Response('<html>', { status: 200 }),
      jsonResponse({ data: 'x' }),
      jsonResponse({ success: false, data: [] }),
      jsonResponse({ data: [{ id: 1, name: 'A', variations: [{ retail_price: 1 }] }] }),
    ]) {
      const { connector } = harness([res]);
      expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_bad_response');
    }
  });

  it('sản phẩm tên rỗng → pancake_bad_response', async () => {
    const { connector } = harness([page([productNode(1, { name: '' })])]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_bad_response');
  });

  it('thân quá lớn (content-length hoặc thực tế) → pancake_bad_response', async () => {
    const declared = new Response('{}', {
      status: 200,
      headers: { 'content-length': String(17 * 1024 * 1024) },
    });
    const a = harness([declared]);
    expect((await failureOf(a.connector.fetchCatalog())).message).toBe('pancake_bad_response');

    const big = new Response(new Uint8Array(17 * 1024 * 1024), { status: 200 });
    const b = harness([big]);
    expect((await failureOf(b.connector.fetchCatalog())).message).toBe('pancake_bad_response');
  });

  it('không có thân → pancake_bad_response', async () => {
    const { connector } = harness([new Response(null, { status: 200 })]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_bad_response');
  });

  it('getApiKey lỗi thường → pancake_key_unavailable; PlatformError giữ nguyên', async () => {
    const a = createPancakeConnector({
      ...BASE,
      getApiKey: async () => {
        throw new Error('boom');
      },
    });
    expect((await failureOf(a.fetchCatalog())).message).toBe('pancake_key_unavailable');
    const b = createPancakeConnector({
      ...BASE,
      getApiKey: async () => {
        throw new PlatformError('PERMISSION', { message: 'x' });
      },
    });
    expect((await failureOf(b.fetchCatalog())).code).toBe('PERMISSION');
  });

  it('khóa rỗng → pancake_key_unavailable, không gọi mạng', async () => {
    const { connector, calls } = harness([], { getApiKey: async () => '' });
    expect((await failureOf(connector.fetchCatalog())).message).toBe('pancake_key_unavailable');
    expect(calls).toHaveLength(0);
  });
});
