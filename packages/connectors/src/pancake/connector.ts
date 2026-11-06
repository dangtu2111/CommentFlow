import { z } from 'zod';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';

/**
 * Connector Pancake POS CHỈ ĐỌC (FR-122, docs/12 §4, Q-PAN1) qua Open API `https://pos.pages.fm/api/v1`. Quy ước như
 * các connector khác (ADR 010): không retry ngầm, không log, lỗi ra ngoài chỉ là mã + thông báo cố định (`pancake_*`)
 * — không khóa hay nội dung. Tên trường/đường dẫn viết theo tài liệu công khai https://docs.pancake.vn/
 * (`GET /shops/{SHOP_ID}/products`), CHƯA kiểm với shop thật. Chỉ có GET.
 *
 * Máy chủ cố định (không nhận từ người dùng → không có SSRF); mã shop đi vào đường dẫn nên được kiểm dạng số nghiêm
 * ngặt. API xác thực bằng tham số `api_key` ở query (theo tài liệu) → URL chứa bí mật: không bao giờ log/ném URL,
 * mọi lỗi mạng bị thay bằng thông báo cố định.
 *
 * Mô hình dữ liệu: sản phẩm luôn có mảng `variations` (sản phẩm đơn = một biến thể); giá `retail_price`, tồn
 * `remain_quantity`, SKU `custom_id`, thuộc tính `fields[{name, value}]`, ẩn `is_hidden`.
 */

const API_ORIGIN = 'https://pos.pages.fm/api/v1';
/** Mã shop Pancake là số nguyên dương. */
const SHOP_ID = /^[0-9]{1,20}$/;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 400;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;

// Số nguyên an toàn thôi: id vượt 2^53 mất chính xác → hai id khác nhau có thể bị gộp.
const idSchema = z.union([z.number().int().safe(), z.string()]).transform(String);
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');
const numberOrNull = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const variationSchema = z.object({
  id: idSchema,
  custom_id: text,
  retail_price: numberOrNull,
  remain_quantity: numberOrNull,
  is_hidden: z.boolean().nullish(),
  fields: z.array(z.object({ name: text, value: text })).nullish(),
});
const productSchema = z.object({
  id: idSchema,
  name: z.string(),
  is_hidden: z.boolean().nullish(),
  categories: z.array(z.object({ name: text })).nullish(),
  variations: z.array(variationSchema).default([]),
});
const envelopeSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(productSchema),
  total_pages: z.number().optional(),
});

type Product = z.infer<typeof productSchema>;
type Variation = z.infer<typeof variationSchema>;

export type PancakeVariant = {
  id: string;
  /** `custom_id`; `null` khi trống. */
  sku: string | null;
  /** `retail_price` (VND, số thực từ API; chuẩn hóa ở `normalize.ts`). */
  price: number | null;
  /** `remain_quantity`; `null` khi API không trả. */
  quantity: number | null;
  attrs: Record<string, string>;
  /** Biến thể không bị ẩn. */
  sellable: boolean;
};

export type PancakeProduct = {
  id: string;
  title: string;
  category: string;
  /** Sản phẩm không bị ẩn. */
  published: boolean;
  /** Open API không trả URL cửa hàng; để `null` (không bịa). */
  url: string | null;
  variants: PancakeVariant[];
};

export type PancakeCatalog = { products: PancakeProduct[] };

export type PancakeConnectorOptions = {
  /** Mã shop Pancake (số; đi vào đường dẫn nên đã kiểm dạng). */
  shopId: string;
  /** API key của shop; tiêm lúc dựng, không qua tham số hàm/log. */
  getApiKey: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Số bản ghi mỗi trang (1–100). */
  pageSize?: number;
  /** Trần số trang; vượt → lỗi (không trả danh mục dang dở). */
  maxPages?: number;
};

export interface PancakeConnector {
  /** Sản phẩm kèm biến thể, giá, tồn; phân trang `page_number`/`page_size`; lọc "đang bán" ở chuẩn hóa. */
  fetchCatalog(): Promise<PancakeCatalog>;
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

async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw fail('UNKNOWN', 'pancake_bad_response');
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
      throw fail('UNKNOWN', 'pancake_bad_response');
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

function failureOfStatus(response: Response): PlatformError {
  const { status } = response;
  if (status === 429)
    return fail('RATE_LIMIT', 'pancake_rate_limited', retryAfterHeader(response.headers));
  if (status === 401) return fail('TOKEN_EXPIRED', 'pancake_unauthorized');
  if (status === 403) return fail('PERMISSION', 'pancake_forbidden');
  return fail('UNKNOWN', 'pancake_http_error');
}

function toVariant(row: Variation): PancakeVariant {
  const attrs: Record<string, string> = {};
  for (const { name, value } of row.fields ?? []) {
    if (name !== '' && value !== '') attrs[name] = value;
  }
  return {
    id: row.id,
    sku: row.custom_id === '' ? null : row.custom_id,
    price: row.retail_price,
    quantity: row.remain_quantity,
    attrs,
    sellable: row.is_hidden !== true,
  };
}

function toProduct(row: Product): PancakeProduct {
  if (row.name === '') throw fail('UNKNOWN', 'pancake_bad_response');
  return {
    id: row.id,
    title: row.name,
    category: (row.categories ?? []).find((c) => c.name !== '')?.name ?? '',
    published: row.is_hidden !== true,
    url: null,
    variants: row.variations.map(toVariant),
  };
}

export function createPancakeConnector(options: PancakeConnectorOptions): PancakeConnector {
  const {
    shopId,
    getApiKey,
    fetch: fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
  } = options;
  if (!SHOP_ID.test(shopId)) {
    throw new Error('shopId chỉ gồm chữ số (tối đa 20 ký tự).');
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

  async function keyOf(): Promise<string> {
    let key: string;
    try {
      key = await getApiKey();
    } catch (error) {
      throw isPlatformError(error) ? error : fail('TOKEN_EXPIRED', 'pancake_key_unavailable');
    }
    if (key === '') throw fail('TOKEN_EXPIRED', 'pancake_key_unavailable');
    return key;
  }

  /** Một trang = một lần gọi mạng. */
  async function fetchPage(pageNumber: number): Promise<z.infer<typeof envelopeSchema>> {
    const apiKey = await keyOf();
    const url = new URL(`${API_ORIGIN}/shops/${shopId}/products`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('page_number', String(pageNumber));
    url.searchParams.set('page_size', String(pageSize));
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Cố ý bỏ lỗi gốc: thông báo của fetch có thể chứa URL (kèm api_key).
      throw fail('UNKNOWN', 'pancake_network_error');
    }
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // Luồng đã hỏng: bỏ qua, vẫn trả mã lỗi chuẩn.
      }
      throw failureOfStatus(response);
    }
    try {
      const envelope = envelopeSchema.parse(JSON.parse(await readBoundedText(response)));
      if (envelope.success === false) throw fail('UNKNOWN', 'pancake_bad_response');
      return envelope;
    } catch (error) {
      throw isPlatformError(error) ? error : fail('UNKNOWN', 'pancake_bad_response');
    }
  }

  return {
    async fetchCatalog() {
      const byId = new Map<string, Product>();
      for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
        const { data, total_pages: totalPages } = await fetchPage(pageNo);
        const before = byId.size;
        for (const row of data) byId.set(row.id, row);
        // Có total_pages thì tin nó (API có thể rút gọn page_size); không có thì dựa vào trang ngắn.
        // Trang trống khi còn trang sau → rơi xuống kiểm "không có dòng mới" bên dưới (lỗi, không trả dang dở).
        const done = totalPages === undefined ? data.length < pageSize : pageNo >= totalPages;
        if (done) return { products: [...byId.values()].map(toProduct) };
        // Trang đầy mà không có dòng mới: API bỏ qua `page_number` → dừng sớm, không trả danh mục không tin được.
        if (byId.size === before) throw fail('UNKNOWN', 'pancake_bad_response');
      }
      throw fail('UNKNOWN', 'pancake_too_many_pages');
    },
  };
}
