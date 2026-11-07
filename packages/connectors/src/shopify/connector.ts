import { DEFAULT_SHOPIFY_API_VERSION, isShopifyApiVersion } from '@flow/shared';
import { z } from 'zod';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';

/**
 * Connector Shopify CHỈ ĐỌC (FR-052, docs/12 §4.1, Q-SHI1) qua Admin GraphQL. Quy ước như các connector khác
 * (ADR 010): không retry ngầm, không log, lỗi ra ngoài chỉ là mã + thông báo cố định (`shopify_*`) — không token, tên
 * miền hay nội dung. Tên trường/mã lỗi viết theo tài liệu công khai https://shopify.dev/docs/api/admin-graphql,
 * CHƯA kiểm với cửa hàng thật. Chỉ có `query` (không `mutation`).
 *
 * Giới hạn tốc độ: Shopify tính theo ĐIỂM truy vấn (`extensions.cost.throttleStatus`). Sau mỗi lần gọi connector nhớ số
 * điểm còn lại và chờ (hàm `sleep` tiêm vào) trước lần sau nếu không đủ; `THROTTLED`/HTTP 429 → `RATE_LIMIT`.
 */

/** Ghim phiên bản API (đổi bằng `SHOPIFY_API_VERSION`, xem `readShopifyConfig`); kiểm lại khi có dev store. */
export { DEFAULT_SHOPIFY_API_VERSION };

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
/** 25 sản phẩm × 25 biến thể ≈ 650 điểm < trần 1.000 điểm/truy vấn của Shopify. */
const MAX_PAGE_SIZE = 25;
const DEFAULT_PAGE_SIZE = 20;
const VARIANTS_INLINE = 25;
const VARIANTS_FOLLOW_UP = 100;
const DEFAULT_MAX_PAGES = 200;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;
const DEFAULT_THROTTLE_RETRY_SECONDS = 2;
const MAX_BUDGET_WAIT_MS = 60_000;

const VARIANT_FIELDS = `
  id
  sku
  title
  price
  compareAtPrice
  inventoryQuantity
  inventoryItem { tracked }
  selectedOptions { name value }`;

const PRODUCTS_QUERY = `query CfProducts($first: Int!, $after: String, $query: String!, $variants: Int!) {
  shop { currencyCode }
  products(first: $first, after: $after, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      status
      productType
      onlineStoreUrl
      variants(first: $variants) {
        pageInfo { hasNextPage endCursor }
        nodes {${VARIANT_FIELDS}
        }
      }
    }
  }
}`;

const VARIANTS_QUERY = `query CfVariants($id: ID!, $first: Int!, $after: String) {
  node(id: $id) {
    ... on Product {
      variants(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {${VARIANT_FIELDS}
        }
      }
    }
  }
}`;

const POLICIES_QUERY = `query CfPolicies {
  shop { shopPolicies { type title body url } }
}`;

/** Danh sách webhook đã đăng ký cho app (FR-113); chỉ cần chủ đề, tối đa 100 (đủ cho vài chủ đề bắt buộc). */
const WEBHOOKS_QUERY = `query CfWebhooks {
  webhookSubscriptions(first: 100) { nodes { topic } }
}`;

const webhooksDataSchema = z.object({
  webhookSubscriptions: z.object({ nodes: z.array(z.object({ topic: z.string() })) }),
});

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});
const variantNodeSchema = z.object({
  id: z.string().min(1),
  sku: z.string().nullable(),
  title: z.string(),
  price: z.string(),
  compareAtPrice: z.string().nullable(),
  inventoryQuantity: z.number().nullable(),
  inventoryItem: z.object({ tracked: z.boolean() }).nullable(),
  selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
});
const variantConnectionSchema = z.object({
  pageInfo: pageInfoSchema,
  nodes: z.array(variantNodeSchema),
});
const productsDataSchema = z.object({
  shop: z.object({ currencyCode: z.string().min(1) }),
  products: z.object({
    pageInfo: pageInfoSchema,
    nodes: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        handle: z.string(),
        status: z.string(),
        productType: z.string(),
        onlineStoreUrl: z.string().nullable(),
        variants: variantConnectionSchema,
      }),
    ),
  }),
});
const variantsDataSchema = z.object({
  node: z.object({ variants: variantConnectionSchema }).nullable(),
});
const policiesDataSchema = z.object({
  shop: z.object({
    shopPolicies: z.array(
      z.object({ type: z.string(), title: z.string(), body: z.string(), url: z.string() }),
    ),
  }),
});
const envelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        extensions: z.object({ code: z.string() }).partial().optional(),
      }),
    )
    .optional(),
  extensions: z
    .object({
      cost: z.object({
        requestedQueryCost: z.number(),
        throttleStatus: z.object({ currentlyAvailable: z.number(), restoreRate: z.number() }),
      }),
    })
    .optional(),
});

export type ShopifyVariant = {
  id: string;
  sku: string | null;
  title: string;
  /** Chuỗi thập phân theo tiền tệ cửa hàng. */
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  /** `inventoryItem.tracked`: cửa hàng có theo dõi tồn cho biến thể này không. */
  tracked: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  onlineStoreUrl: string | null;
  variants: ShopifyVariant[];
};

export type ShopifyCatalog = { currencyCode: string; products: ShopifyProduct[] };

export type ShopifyPolicy = { type: string; title: string; body: string; url: string };

export type ShopifyConnectorOptions = {
  /** `<tên>.myshopify.com` (đã kiểm dạng — chặn SSRF). */
  shopDomain: string;
  /** Token Admin API chỉ đọc; tiêm lúc dựng, không qua tham số hàm/log. Nơi dựng lấy từ kho token, không từ `.env` ở đây. */
  getAccessToken: () => Promise<string>;
  apiVersion?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Số sản phẩm mỗi trang (1–25). */
  pageSize?: number;
  /** Trần số trang cho mỗi chuỗi phân trang; vượt → lỗi (không trả danh mục dang dở). */
  maxPages?: number;
  /** Chờ `ms` mili giây; mặc định `setTimeout`. Tiêm ở test (không `sleep` thật). */
  sleep?: (ms: number) => Promise<void>;
};

export interface ShopifyConnector {
  /** Sản phẩm `status:active` kèm toàn bộ biến thể (phân trang theo con trỏ). */
  fetchCatalog(): Promise<ShopifyCatalog>;
  /** Chính sách cửa hàng có nội dung (đổi trả, vận chuyển…). */
  fetchPolicies(): Promise<ShopifyPolicy[]>;
  /** Chủ đề webhook (enum `WebhookSubscriptionTopic`) app đã đăng ký, loại trùng; để đối soát (FR-113). */
  listWebhookSubscriptions(): Promise<string[]>;
}

const fail = (
  code: PlatformErrorCode,
  message: string,
  retryAfterSeconds?: number,
): PlatformError =>
  new PlatformError(code, {
    message,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw fail('UNKNOWN', 'shopify_bad_response');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw fail('UNKNOWN', 'shopify_bad_response');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** `Retry-After` (giây, có thể lẻ) → số giây nguyên có chặn trần; thiếu/hỏng → undefined. */
function retryAfterHeader(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
}

type Envelope = z.infer<typeof envelopeSchema>;
type Throttle = { available: number; restoreRate: number; nextCost: number };

export function createShopifyConnector(options: ShopifyConnectorOptions): ShopifyConnector {
  const {
    shopDomain,
    getAccessToken,
    apiVersion = DEFAULT_SHOPIFY_API_VERSION,
    fetch: fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
    sleep = defaultSleep,
  } = options;
  if (!SHOP_DOMAIN.test(shopDomain)) {
    throw new Error('shopDomain phải có dạng <tên>.myshopify.com.');
  }
  if (!isShopifyApiVersion(apiVersion)) {
    throw new Error('apiVersion phải có dạng YYYY-MM (01/04/07/10).');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize phải là số nguyên trong [1, ${MAX_PAGE_SIZE}].`);
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('maxPages phải là số nguyên ≥ 1.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}].`);
  }
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  let throttle: Throttle | null = null;

  async function tokenOf(): Promise<string> {
    try {
      return await getAccessToken();
    } catch (error) {
      throw isPlatformError(error) ? error : fail('TOKEN_EXPIRED', 'shopify_token_unavailable');
    }
  }

  async function waitForBudget(): Promise<void> {
    if (throttle === null || throttle.available >= throttle.nextCost) return;
    const deficit = throttle.nextCost - throttle.available;
    const waitMs = Math.ceil((deficit * 1000) / Math.max(throttle.restoreRate, 1));
    // Phản hồi bất thường không được giữ job quá lâu: vượt trần thì báo RATE_LIMIT để nơi gọi hẹn lại.
    if (waitMs > MAX_BUDGET_WAIT_MS) {
      throw fail('RATE_LIMIT', 'shopify_throttled', Math.ceil(waitMs / 1000));
    }
    await sleep(waitMs);
  }

  function rememberThrottle(envelope: Envelope): void {
    const cost = envelope.extensions?.cost;
    if (cost === undefined) return;
    throttle = {
      available: cost.throttleStatus.currentlyAvailable,
      restoreRate: cost.throttleStatus.restoreRate,
      nextCost: cost.requestedQueryCost,
    };
  }

  function throttledRetrySeconds(envelope: Envelope): number {
    const cost = envelope.extensions?.cost;
    if (cost === undefined) return DEFAULT_THROTTLE_RETRY_SECONDS;
    const deficit = Math.max(cost.requestedQueryCost - cost.throttleStatus.currentlyAvailable, 0);
    return Math.min(
      Math.max(Math.ceil(deficit / Math.max(cost.throttleStatus.restoreRate, 1)), 1),
      MAX_RETRY_AFTER_SECONDS,
    );
  }

  function failureOfStatus(response: Response): PlatformError {
    const { status } = response;
    if (status === 429)
      return fail('RATE_LIMIT', 'shopify_rate_limited', retryAfterHeader(response.headers));
    if (status === 401) return fail('TOKEN_EXPIRED', 'shopify_unauthorized');
    if (status === 402 || status === 403) return fail('PERMISSION', 'shopify_forbidden');
    return fail('UNKNOWN', 'shopify_http_error');
  }

  /**
   * Trường và quyền mà Shopify báo thiếu trong lỗi ACCESS_DENIED (ví dụ "Access denied for onlineStoreUrl field. Required access:
   * \`read_publications\`") → hậu tố `:field_<tên>:scope_<quyền>` để Owner biết cần sửa gì. CHỈ nhận tên trường/tên quyền theo
   * danh sách trắng ký tự; không bao giờ đưa nguyên thông điệp vào lỗi/log.
   */
  function accessDeniedDetail(envelope: Envelope): string {
    const message =
      (envelope.errors ?? []).find((e) => e.extensions?.code === 'ACCESS_DENIED')?.message ?? '';
    const field = /Access denied for ([A-Za-z0-9_]{1,60}) field/.exec(message)?.[1];
    const scope = /`((?:read|write)_[a-z0-9_]{1,60})`/.exec(message)?.[1];
    return `${field ? `:field_${field}` : ''}${scope ? `:scope_${scope}` : ''}`;
  }

  function failureOfGraphql(envelope: Envelope): PlatformError {
    const codes = (envelope.errors ?? []).map((e) => e.extensions?.code);
    if (codes.includes('THROTTLED')) {
      return fail('RATE_LIMIT', 'shopify_throttled', throttledRetrySeconds(envelope));
    }
    if (codes.includes('ACCESS_DENIED')) {
      return fail('PERMISSION', `shopify_access_denied${accessDeniedDetail(envelope)}`);
    }
    return fail('UNKNOWN', 'shopify_graphql_error');
  }

  /** Một lệnh = một lần gọi mạng; trả `data` đã kiểm hình dạng bằng `schema`. */
  async function run<T>(
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const token = await tokenOf();
    await waitForBudget();
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw fail('UNKNOWN', 'shopify_network_error');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw failureOfStatus(response);
    }
    let envelope: Envelope;
    try {
      envelope = envelopeSchema.parse(JSON.parse(await readBoundedText(response)));
    } catch (error) {
      throw isPlatformError(error) ? error : fail('UNKNOWN', 'shopify_bad_response');
    }
    rememberThrottle(envelope);
    if (envelope.errors !== undefined && envelope.errors.length > 0)
      throw failureOfGraphql(envelope);
    const parsed = schema.safeParse(envelope.data);
    if (!parsed.success) throw fail('UNKNOWN', 'shopify_bad_response');
    return parsed.data;
  }

  const toVariant = (node: z.infer<typeof variantNodeSchema>): ShopifyVariant => ({
    id: node.id,
    sku: node.sku,
    title: node.title,
    price: node.price,
    compareAtPrice: node.compareAtPrice,
    inventoryQuantity: node.inventoryQuantity,
    tracked: node.inventoryItem?.tracked ?? false,
    selectedOptions: node.selectedOptions,
  });

  /** Lấy nốt biến thể khi sản phẩm có hơn `VARIANTS_INLINE` biến thể. */
  async function remainingVariants(
    productId: string,
    cursor: string | null,
  ): Promise<ShopifyVariant[]> {
    const rest: ShopifyVariant[] = [];
    let after = cursor;
    for (let page = 0; page < maxPages; page += 1) {
      const data = await run(
        VARIANTS_QUERY,
        { id: productId, first: VARIANTS_FOLLOW_UP, after },
        variantsDataSchema,
      );
      if (data.node === null) return rest;
      rest.push(...data.node.variants.nodes.map(toVariant));
      if (!data.node.variants.pageInfo.hasNextPage) return rest;
      after = data.node.variants.pageInfo.endCursor;
    }
    throw fail('UNKNOWN', 'shopify_too_many_pages');
  }

  return {
    async fetchCatalog() {
      const products: ShopifyProduct[] = [];
      let currencyCode = '';
      let after: string | null = null;
      for (let page = 0; page < maxPages; page += 1) {
        const data: z.infer<typeof productsDataSchema> = await run(
          PRODUCTS_QUERY,
          { first: pageSize, after, query: 'status:active', variants: VARIANTS_INLINE },
          productsDataSchema,
        );
        currencyCode = data.shop.currencyCode;
        for (const node of data.products.nodes) {
          const variants = node.variants.nodes.map(toVariant);
          if (node.variants.pageInfo.hasNextPage) {
            variants.push(...(await remainingVariants(node.id, node.variants.pageInfo.endCursor)));
          }
          products.push({
            id: node.id,
            title: node.title,
            handle: node.handle,
            status: node.status,
            productType: node.productType,
            onlineStoreUrl: node.onlineStoreUrl,
            variants,
          });
        }
        if (!data.products.pageInfo.hasNextPage) return { currencyCode, products };
        after = data.products.pageInfo.endCursor;
      }
      throw fail('UNKNOWN', 'shopify_too_many_pages');
    },

    async fetchPolicies() {
      const data = await run(POLICIES_QUERY, {}, policiesDataSchema);
      return data.shop.shopPolicies.filter((policy) => policy.body.trim() !== '');
    },

    async listWebhookSubscriptions() {
      const data = await run(WEBHOOKS_QUERY, {}, webhooksDataSchema);
      return [...new Set(data.webhookSubscriptions.nodes.map((node) => node.topic))];
    },
  };
}
