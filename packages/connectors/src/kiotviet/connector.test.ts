import { describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../errors';
import { createKiotVietConnector, type KiotVietConnectorOptions } from './connector';
import {
  FAKE_RETAILER,
  FAKE_TOKEN,
  inventoryNode,
  jsonResponse,
  masterNode,
  productNode,
  productsPage,
  variantNode,
} from './fixtures';

type Call = { url: URL; init: RequestInit };

const BASE = { retailer: FAKE_RETAILER, getAccessToken: async () => FAKE_TOKEN };

function harness(responses: Array<Response | Error>, over: Partial<KiotVietConnectorOptions> = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    if (next instanceof Error) throw next;
    return next;
  });
  const connector = createKiotVietConnector({
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

const page = (nodes: unknown[], total?: number) => jsonResponse(productsPage(nodes, total));

describe('FR-122 createKiotVietConnector — cấu hình', () => {
  it.each([0, 101, 1.5])('pageSize không hợp lệ (%s) bị từ chối', (pageSize) => {
    expect(() => createKiotVietConnector({ ...BASE, pageSize })).toThrow();
  });
  it('maxPages/timeoutMs không hợp lệ bị từ chối', () => {
    expect(() => createKiotVietConnector({ ...BASE, maxPages: 0 })).toThrow();
    expect(() => createKiotVietConnector({ ...BASE, timeoutMs: 0 })).toThrow();
  });
  it.each(['', 'a b', 'shop\r\nX-Evil: 1', '-x', 'a.b', 'shop/../x', 'x'.repeat(51)])(
    'tên cửa hàng không hợp lệ (%j) bị từ chối — chặn chèn header',
    (retailer) => {
      expect(() => createKiotVietConnector({ ...BASE, retailer })).toThrow(/retailer/);
    },
  );
  it('tên cửa hàng hợp lệ có hoa/gạch dưới/gạch ngang', () => {
    expect(() => createKiotVietConnector({ ...BASE, retailer: 'Shop_A-1' })).not.toThrow();
  });
});

describe('FR-122 KiotViet fetchCatalog', () => {
  it('GET máy chủ cố định, tên cửa hàng ở Retailer, token ở Authorization, không theo redirect', async () => {
    const { connector, calls } = harness([page([productNode(1)])]);
    const catalog = await connector.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(calls).toHaveLength(1);
    const call = calls[0] as Call;
    expect(`${call.url.origin}${call.url.pathname}`).toBe('https://public.kiotapi.com/products');
    expect(call.url.searchParams.get('currentItem')).toBe('0');
    expect(call.url.searchParams.get('pageSize')).toBe('100');
    expect(call.url.searchParams.get('includeInventory')).toBe('true');
    expect(call.init.method).toBe('GET');
    expect(call.init.redirect).toBe('error');
    const headers = (call.init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(headers.Retailer).toBe(FAKE_RETAILER);
    expect(call.url.href).not.toContain(FAKE_TOKEN);
  });

  it('sản phẩm đơn → một biến thể; giá/tồn/SKU/danh mục được giữ', async () => {
    const { connector } = harness([
      page([
        productNode(1, {
          inventories: [inventoryNode(3, 1), inventoryNode(4, 2)],
          attributes: [{ attributeName: 'Size', attributeValue: 'M' }],
        }),
      ]),
    ]);
    const [product] = (await connector.fetchCatalog()).products;
    expect(product).toMatchObject({
      id: '1',
      title: 'Áo thun 1',
      category: 'Áo',
      published: true,
      url: null,
    });
    expect(product?.variants).toEqual([
      {
        id: '1',
        sku: 'SP1',
        price: 150000,
        quantity: 7,
        attrs: { Size: 'M' },
        sellable: true,
      },
    ]);
  });

  it('gom biến thể theo masterProductId; cha không phải biến thể; biến thể mồ côi bị bỏ', async () => {
    const { connector } = harness([
      page([
        masterNode(10),
        variantNode(11, 10),
        variantNode(12, 10, { isActive: false }),
        variantNode(13, 999),
        productNode(20),
      ]),
    ]);
    const { products } = await connector.fetchCatalog();
    expect(products.map((p) => p.id)).toEqual(['10', '20']);
    expect(products[0]?.variants.map((v) => v.id)).toEqual(['11', '12']);
    expect(products[0]?.variants.map((v) => v.sellable)).toEqual([true, false]);
  });

  it('masterProductId trùng chính id vẫn là sản phẩm gốc', async () => {
    const { connector } = harness([page([productNode(5, { masterProductId: 5 })])]);
    expect((await connector.fetchCatalog()).products.map((p) => p.id)).toEqual(['5']);
  });

  it('đủ mặc định khi thiếu trường tùy chọn; id/giá dạng chuỗi', async () => {
    const { connector } = harness([
      page([{ id: '7', name: 'Mũ', basePrice: null, inventories: [{ onHand: null }] }]),
    ]);
    const [product] = (await connector.fetchCatalog()).products;
    expect(product).toMatchObject({ id: '7', title: 'Mũ', category: '', published: true });
    expect(product?.variants).toEqual([
      { id: '7', sku: null, price: null, quantity: null, attrs: {}, sellable: true },
    ]);
  });

  it('tồn âm/lẻ ở một chi nhánh → null (không bù trừ giữa chi nhánh)', async () => {
    const { connector } = harness([
      page([
        productNode(1, { inventories: [inventoryNode(-3, 1), inventoryNode(5, 2)] }),
        productNode(2, { inventories: [inventoryNode(0.5, 1), inventoryNode(0.5, 2)] }),
      ]),
    ]);
    const { products } = await connector.fetchCatalog();
    expect(products.map((p) => p.variants[0]?.quantity)).toEqual([null, null]);
  });

  it('sản phẩm không có inventories → tồn không biết (null)', async () => {
    const { connector } = harness([page([productNode(1, { inventories: [] })])]);
    expect((await connector.fetchCatalog()).products[0]?.variants[0]?.quantity).toBeNull();
  });

  it('thuộc tính rỗng bị bỏ; mã (code) rỗng → sku null', async () => {
    const { connector } = harness([
      page([
        productNode(1, {
          code: '',
          attributes: [
            { attributeName: 'Màu', attributeValue: '' },
            { attributeName: '', attributeValue: 'x' },
            { attributeName: 'Size', attributeValue: 'L' },
          ],
        }),
      ]),
    ]);
    const variant = (await connector.fetchCatalog()).products[0]?.variants[0];
    expect(variant?.sku).toBeNull();
    expect(variant?.attrs).toEqual({ Size: 'L' });
  });

  it('không bán (allowsSale=false hoặc isActive=false) → published=false', async () => {
    const { connector } = harness([
      page([productNode(1, { allowsSale: false }), productNode(2, { isActive: false })]),
    ]);
    expect((await connector.fetchCatalog()).products.map((p) => p.published)).toEqual([
      false,
      false,
    ]);
  });

  it('thiếu tên → lỗi bad_response', async () => {
    const { connector } = harness([page([{ id: 1, name: '' }])]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
  });

  it('phân trang theo currentItem đến khi trang < pageSize; loại trùng id', async () => {
    const { connector, calls } = harness(
      [
        page([productNode(1), productNode(2)], 99),
        page([productNode(2), productNode(3)], 99),
        page([productNode(4)], 99),
      ],
      { pageSize: 2 },
    );
    const { products } = await connector.fetchCatalog();
    expect(products.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    expect(calls.map((c) => c.url.searchParams.get('currentItem'))).toEqual(['0', '2', '4']);
  });

  it('dừng khi đã đủ total dù trang đầy', async () => {
    const { connector, calls } = harness([page([productNode(1), productNode(2)], 2)], {
      pageSize: 2,
    });
    expect((await connector.fetchCatalog()).products).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('total thiếu: dừng theo trang ngắn', async () => {
    const { connector } = harness(
      [
        jsonResponse({ data: [productNode(1), productNode(2)] }),
        jsonResponse({ data: [productNode(3)] }),
      ],
      { pageSize: 2 },
    );
    expect((await connector.fetchCatalog()).products).toHaveLength(3);
  });

  it('trang đầy nhưng không có sản phẩm mới → bad_response (API bỏ qua currentItem)', async () => {
    const same = [productNode(1), productNode(2)];
    const { connector } = harness([page(same, 99), page(same, 99)], { pageSize: 2 });
    expect((await failureOf(connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
  });

  it('vượt maxPages → lỗi, không trả danh mục dang dở', async () => {
    const { connector } = harness(
      [page([productNode(1), productNode(2)], 99), page([productNode(3), productNode(4)], 99)],
      { pageSize: 2, maxPages: 2 },
    );
    expect((await failureOf(connector.fetchCatalog())).message).toBe('kiotviet_too_many_pages');
  });

  it.each([
    [401, 'TOKEN_EXPIRED', 'kiotviet_unauthorized'],
    [403, 'PERMISSION', 'kiotviet_forbidden'],
    [429, 'RATE_LIMIT', 'kiotviet_rate_limited'],
    [500, 'UNKNOWN', 'kiotviet_http_error'],
  ])('HTTP %i → %s', async (status, code, message) => {
    const { connector } = harness([new Response('chi tiết nhạy cảm', { status })]);
    const error = await failureOf(connector.fetchCatalog());
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.message).not.toContain(FAKE_TOKEN);
  });

  it('429 kèm Retry-After → retryAfterSeconds (chặn trần); hỏng → không có', async () => {
    const a = harness([new Response('', { status: 429, headers: { 'retry-after': '2.2' } })]);
    expect((await failureOf(a.connector.fetchCatalog())).retryAfterSeconds).toBe(3);
    const b = harness([new Response('', { status: 429, headers: { 'retry-after': '999999999' } })]);
    expect((await failureOf(b.connector.fetchCatalog())).retryAfterSeconds).toBe(86_400);
    const c = harness([new Response('', { status: 429, headers: { 'retry-after': 'abc' } })]);
    expect((await failureOf(c.connector.fetchCatalog())).retryAfterSeconds).toBeUndefined();
  });

  it('lỗi mạng → UNKNOWN kiotviet_network_error', async () => {
    const { connector } = harness([new Error('boom')]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('kiotviet_network_error');
  });

  it('JSON hỏng / sai hình dạng → bad_response', async () => {
    const a = harness([new Response('không phải json', { status: 200 })]);
    expect((await failureOf(a.connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
    const b = harness([jsonResponse({ nope: true })]);
    expect((await failureOf(b.connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
  });

  it('thân rỗng (không body) → bad_response', async () => {
    const { connector } = harness([new Response(null, { status: 200 })]);
    expect((await failureOf(connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
  });

  it('phản hồi quá lớn (content-length hoặc thực tế) bị từ chối', async () => {
    const a = harness([
      new Response('{}', { status: 200, headers: { 'content-length': String(32 * 1024 * 1024) } }),
    ]);
    expect((await failureOf(a.connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
    const big = new Response(new Uint8Array(17 * 1024 * 1024), { status: 200 });
    const b = harness([big]);
    expect((await failureOf(b.connector.fetchCatalog())).message).toBe('kiotviet_bad_response');
  });

  it('token lỗi: PlatformError giữ nguyên; lỗi khác → TOKEN_EXPIRED', async () => {
    const own = new PlatformError('PERMISSION', { message: 'kiotviet_forbidden' });
    const a = harness([], {
      getAccessToken: async () => {
        throw own;
      },
    });
    expect(await failureOf(a.connector.fetchCatalog())).toBe(own);
    const b = harness([], {
      getAccessToken: async () => {
        throw new Error(`lộ ${FAKE_TOKEN}`);
      },
    });
    const error = await failureOf(b.connector.fetchCatalog());
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(error.message).toBe('kiotviet_token_unavailable');
  });
});
