import { z } from 'zod';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';

/**
 * Connector Haravan CHỈ ĐỌC (FR-122, docs/12 §4, Q-HRV1) qua Omni API REST. Quy ước như các connector khác
 * (ADR 010): không retry ngầm, không log, lỗi ra ngoài chỉ là mã + thông báo cố định (`haravan_*`) — không token hay
 * nội dung. Tên trường/mã lỗi viết theo tài liệu công khai https://docs.haravan.com, CHƯA kiểm với shop thật. Chỉ có
 * GET. Máy chủ cố định `apis.haravan.com` (không nhận tên miền từ người dùng → không có đường SSRF).
 *
 * Giới hạn tốc độ: Haravan dùng "bucket" — header `X-Haravan-Api-Call-Limit: <đã dùng>/<tối đa>`, xả khoảng 2
 * lệnh/giây. Connector nhớ giá trị sau mỗi lần gọi và chờ (hàm `sleep` tiêm vào) khi bucket gần đầy; HTTP 429 →
 * `RATE_LIMIT`.
 */

export const HARAVAN_API_BASE = 'https://apis.haravan.com/com';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
/** Haravan cho tối đa 250 bản ghi mỗi trang. */
const MAX_PAGE_SIZE = 250;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 400;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;
const MAX_BUDGET_WAIT_MS = 60_000;
/** Tốc độ xả bucket (lệnh/giây) theo tài liệu; chỉ dùng để ước thời gian chờ. */
const BUCKET_LEAK_PER_SECOND = 2;
/** Chừa lại ít nhất ngần này chỗ trống trước khi gọi tiếp. */
const BUCKET_HEADROOM = 2;
const CALL_LIMIT_HEADER = /^(\d{1,6})\/(\d{1,6})$/;

const idSchema = z.union([z.number(), z.string()]).transform(String);
const moneySchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => (value === null || value === undefined ? null : String(value)));
const optionSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const variantSchema = z.object({
  id: idSchema,
  sku: z
    .string()
    .nullish()
    .transform((value) => (value === null || value === undefined || value === '' ? null : value)),
  title: z.string().default(''),
  price: moneySchema,
  compare_at_price: moneySchema,
  inventory_management: z.string().nullish(),
  inventory_quantity: z.number().nullish(),
  option1: optionSchema,
  option2: optionSchema,
  option3: optionSchema,
});
const productSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  handle: z.string().default(''),
  product_type: z.string().nullish(),
  published_at: z.string().nullish(),
  options: z.array(z.object({ name: z.string(), position: z.number().optional() })).default([]),
  variants: z.array(variantSchema),
});
const productsEnvelopeSchema = z.object({ products: z.array(productSchema) });

export type HaravanVariant = {
  id: string;
  sku: string | null;
  title: string;
  /** Chuỗi thập phân theo tiền tệ shop (Haravan: VND). */
  price: string | null;
  compareAtPrice: string | null;
  quantity: number | null;
  /** `inventory_management` có giá trị: shop có theo dõi tồn cho biến thể này không. */
  managed: boolean;
  /** `option1..3` theo thứ tự, ứng với `HaravanProduct.optionNames`. */
  optionValues: [string | null, string | null, string | null];
};

export type HaravanProduct = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  /** `published_at` có giá trị (Omni API không có trạng thái `active` như Shopify). */
  published: boolean;
  optionNames: string[];
  /** Omni API không trả URL cửa hàng; để `null` (không bịa từ `handle`). */
  url: string | null;
  variants: HaravanVariant[];
};

export type HaravanCatalog = { products: HaravanProduct[] };

export type HaravanConnectorOptions = {
  /** Token truy cập Omni API (scope chỉ đọc); tiêm lúc dựng, không qua tham số hàm/log. Nơi dựng lấy từ kho token. */
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Số sản phẩm mỗi trang (1–250). */
  pageSize?: number;
  /** Trần số trang; vượt → lỗi (không trả danh mục dang dở). */
  maxPages?: number;
  /** Chờ `ms` mili giây; mặc định `setTimeout`. Tiêm ở test. */
  sleep?: (ms: number) => Promise<void>;
};

export interface HaravanConnector {
  /** Sản phẩm đã xuất bản kèm toàn bộ biến thể (phân trang `page`/`limit`). */
  fetchCatalog(): Promise<HaravanCatalog>;
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
    throw fail('UNKNOWN', 'haravan_bad_response');
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
      throw fail('UNKNOWN', 'haravan_bad_response');
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

/** Thời gian chờ (ms) để bucket có lại chỗ trống; 0 nếu header thiếu/hỏng hoặc còn đủ chỗ. */
function bucketWaitMs(headers: Headers): number {
  const match = CALL_LIMIT_HEADER.exec(headers.get('x-haravan-api-call-limit') ?? '');
  if (match === null) return 0;
  const used = Number(match[1]);
  const max = Number(match[2]);
  const overflow = used - (max - BUCKET_HEADROOM);
  return overflow > 0 ? Math.ceil((overflow * 1000) / BUCKET_LEAK_PER_SECOND) : 0;
}

function failureOfStatus(response: Response): PlatformError {
  const { status } = response;
  if (status === 429)
    return fail('RATE_LIMIT', 'haravan_rate_limited', retryAfterHeader(response.headers));
  if (status === 401) return fail('TOKEN_EXPIRED', 'haravan_unauthorized');
  if (status === 403) return fail('PERMISSION', 'haravan_forbidden');
  return fail('UNKNOWN', 'haravan_http_error');
}

const toVariant = (node: z.infer<typeof variantSchema>): HaravanVariant => ({
  id: node.id,
  sku: node.sku,
  title: node.title,
  price: node.price,
  compareAtPrice: node.compare_at_price,
  quantity: node.inventory_quantity ?? null,
  managed: node.inventory_management !== null && node.inventory_management !== undefined,
  optionValues: [node.option1, node.option2, node.option3],
});

const toProduct = (node: z.infer<typeof productSchema>): HaravanProduct => ({
  id: node.id,
  title: node.title,
  handle: node.handle,
  productType: node.product_type ?? '',
  published: node.published_at !== null && node.published_at !== undefined,
  optionNames: [...node.options]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((option) => option.name),
  url: null,
  variants: node.variants.map(toVariant),
});

export function createHaravanConnector(options: HaravanConnectorOptions): HaravanConnector {
  const {
    getAccessToken,
    fetch: fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
    sleep = defaultSleep,
  } = options;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize phải là số nguyên trong [1, ${MAX_PAGE_SIZE}].`);
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('maxPages phải là số nguyên ≥ 1.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs phải trong (0, ${MAX_TIMEOUT_MS}].`);
  }

  async function tokenOf(): Promise<string> {
    try {
      return await getAccessToken();
    } catch (error) {
      throw isPlatformError(error) ? error : fail('TOKEN_EXPIRED', 'haravan_token_unavailable');
    }
  }

  /** Một trang = một lần gọi mạng; trả sản phẩm đã kiểm hình dạng + thời gian chờ trước lần sau. */
  async function fetchPage(
    page: number,
  ): Promise<{ products: HaravanProduct[]; nextWaitMs: number }> {
    const token = await tokenOf();
    const url = new URL(`${HARAVAN_API_BASE}/products.json`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('published_status', 'published');
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw fail('UNKNOWN', 'haravan_network_error');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw failureOfStatus(response);
    }
    const nextWaitMs = bucketWaitMs(response.headers);
    try {
      const envelope = productsEnvelopeSchema.parse(JSON.parse(await readBoundedText(response)));
      return { products: envelope.products.map(toProduct), nextWaitMs };
    } catch (error) {
      throw isPlatformError(error) ? error : fail('UNKNOWN', 'haravan_bad_response');
    }
  }

  return {
    async fetchCatalog() {
      const byId = new Map<string, HaravanProduct>();
      let waitMs = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        // Phản hồi bất thường không được giữ job quá lâu: vượt trần thì báo RATE_LIMIT để nơi gọi hẹn lại.
        if (waitMs > MAX_BUDGET_WAIT_MS) {
          throw fail('RATE_LIMIT', 'haravan_throttled', Math.ceil(waitMs / 1000));
        }
        if (waitMs > 0) await sleep(waitMs);
        const result = await fetchPage(page);
        const before = byId.size;
        for (const product of result.products) byId.set(product.id, product);
        if (result.products.length < pageSize) return { products: [...byId.values()] };
        // Trang đầy mà không có sản phẩm mới: API bỏ qua `page` → dừng sớm, không trả danh mục không tin được.
        if (byId.size === before) throw fail('UNKNOWN', 'haravan_bad_response');
        waitMs = result.nextWaitMs;
      }
      throw fail('UNKNOWN', 'haravan_too_many_pages');
    },
  };
}
