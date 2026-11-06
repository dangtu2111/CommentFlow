import { z } from 'zod';
import { isPlatformError, PlatformError, type PlatformErrorCode } from '../errors';

/**
 * Connector KiotViet CHỈ ĐỌC (FR-122, docs/12 §4, Q-KIO1) qua Public API `https://public.kiotapi.com`. Quy ước như các
 * connector khác (ADR 010): không retry ngầm, không log, lỗi ra ngoài chỉ là mã + thông báo cố định (`kiotviet_*`) —
 * không token hay nội dung. Tên trường/đường dẫn viết theo tài liệu công khai
 * https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/public-api/, CHƯA kiểm với shop thật. Chỉ có GET.
 *
 * Máy chủ cố định (không nhận từ người dùng → không có SSRF); tên cửa hàng (`retailer`) đi vào header `Retailer` nên
 * được kiểm dạng nghiêm ngặt (chặn chèn header). Token lấy qua `getAccessToken` (xem `token.ts`).
 *
 * Mô hình dữ liệu: mỗi biến thể là MỘT DÒNG `products` riêng có `masterProductId` trỏ về sản phẩm cha (`hasVariants`).
 * Connector gom lại thành sản phẩm + danh sách biến thể; biến thể mồ côi (cha không có trong danh sách) bị bỏ.
 */

const API_ORIGIN = 'https://public.kiotapi.com';
/** Tên cửa hàng (Retailer): chữ/số/gạch ngang/gạch dưới, bắt đầu bằng chữ hoặc số. */
const RETAILER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/;

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
/** KiotViet cho tối đa 100 bản ghi mỗi trang. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 400;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_RETRY_AFTER_SECONDS = 86_400;

const idSchema = z.union([z.number(), z.string()]).transform(String);
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

const rowSchema = z.object({
  id: idSchema,
  code: text,
  name: z.string(),
  categoryName: text,
  allowsSale: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
  isActive: z.boolean().default(true),
  masterProductId: idSchema.nullish(),
  basePrice: z
    .number()
    .nullish()
    .transform((value) => value ?? null),
  attributes: z.array(z.object({ attributeName: text, attributeValue: text })).default([]),
  inventories: z
    .array(
      z.object({
        onHand: z
          .number()
          .nullish()
          .transform((value) => value ?? null),
      }),
    )
    .default([]),
});
const envelopeSchema = z.object({
  total: z.number().optional(),
  data: z.array(rowSchema),
});

type Row = z.infer<typeof rowSchema>;

export type KiotVietVariant = {
  id: string;
  /** Mã hàng (`code`); `null` khi trống. */
  sku: string | null;
  /** `basePrice` (VND, số thực từ API; chuẩn hóa ở `normalize.ts`). */
  price: number | null;
  /** Tổng `onHand` mọi chi nhánh; `null` khi không có dữ liệu tồn. */
  quantity: number | null;
  attrs: Record<string, string>;
  /** Đang kinh doanh và cho phép bán (`isActive && allowsSale`). */
  sellable: boolean;
};

export type KiotVietProduct = {
  id: string;
  title: string;
  category: string;
  /** Sản phẩm cha đang kinh doanh và cho phép bán. */
  published: boolean;
  /** Public API không trả URL cửa hàng; để `null` (không bịa). */
  url: string | null;
  variants: KiotVietVariant[];
};

export type KiotVietCatalog = { products: KiotVietProduct[] };

export type KiotVietConnectorOptions = {
  /** Tên cửa hàng KiotViet (header `Retailer`; đã kiểm dạng). */
  retailer: string;
  /** Token Bearer; tiêm lúc dựng (thường từ `createKiotVietTokenProvider`), không qua tham số hàm/log. */
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Số bản ghi mỗi trang (1–100). */
  pageSize?: number;
  /** Trần số trang; vượt → lỗi (không trả danh mục dang dở). */
  maxPages?: number;
};

export interface KiotVietConnector {
  /** Sản phẩm kèm biến thể và tồn (`includeInventory`), phân trang `currentItem`/`pageSize`; lọc "đang bán" ở chuẩn hóa. */
  fetchCatalog(): Promise<KiotVietCatalog>;
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

/** Đọc thân có chặn dung lượng; dùng chung với `token.ts`. */
export async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw fail('UNKNOWN', 'kiotviet_bad_response');
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
      throw fail('UNKNOWN', 'kiotviet_bad_response');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** `Retry-After` (giây, có thể lẻ) → số giây nguyên có chặn trần; thiếu/hỏng → undefined. */
export function retryAfterHeader(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
}

function failureOfStatus(response: Response): PlatformError {
  const { status } = response;
  if (status === 429)
    return fail('RATE_LIMIT', 'kiotviet_rate_limited', retryAfterHeader(response.headers));
  if (status === 401) return fail('TOKEN_EXPIRED', 'kiotviet_unauthorized');
  if (status === 403) return fail('PERMISSION', 'kiotviet_forbidden');
  return fail('UNKNOWN', 'kiotviet_http_error');
}

const sellable = (row: Row): boolean => row.isActive && row.allowsSale;

/** Tổng tồn các chi nhánh; thiếu dữ liệu ở bất kỳ chi nhánh nào → không biết (`null`). */
function stockOf(row: Row): number | null {
  if (row.inventories.length === 0) return null;
  let sum = 0;
  for (const inventory of row.inventories) {
    if (inventory.onHand === null) return null;
    sum += inventory.onHand;
  }
  return sum;
}

function toVariant(row: Row): KiotVietVariant {
  const attrs: Record<string, string> = {};
  for (const { attributeName, attributeValue } of row.attributes) {
    if (attributeName !== '' && attributeValue !== '') attrs[attributeName] = attributeValue;
  }
  return {
    id: row.id,
    sku: row.code === '' ? null : row.code,
    price: row.basePrice,
    quantity: stockOf(row),
    attrs,
    sellable: sellable(row),
  };
}

function toProduct(master: Row, children: Row[]): KiotVietProduct {
  if (master.name === '') throw fail('UNKNOWN', 'kiotviet_bad_response');
  return {
    id: master.id,
    title: master.name,
    category: master.categoryName,
    published: sellable(master),
    url: null,
    variants: (master.hasVariants ? children : [master]).map(toVariant),
  };
}

/** Gom các dòng phẳng thành sản phẩm + biến thể; biến thể mồ côi bị bỏ. */
function groupRows(rows: Row[]): KiotVietProduct[] {
  const children = new Map<string, Row[]>();
  const masters: Row[] = [];
  for (const row of rows) {
    const masterId = row.masterProductId;
    if (masterId === null || masterId === undefined || masterId === row.id) {
      masters.push(row);
    } else {
      children.set(masterId, [...(children.get(masterId) ?? []), row]);
    }
  }
  return masters.map((master) => toProduct(master, children.get(master.id) ?? []));
}

export function createKiotVietConnector(options: KiotVietConnectorOptions): KiotVietConnector {
  const {
    retailer,
    getAccessToken,
    fetch: fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
  } = options;
  if (!RETAILER.test(retailer)) {
    throw new Error('retailer chỉ gồm chữ, số, gạch ngang/gạch dưới (tối đa 50 ký tự).');
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

  async function tokenOf(): Promise<string> {
    try {
      return await getAccessToken();
    } catch (error) {
      throw isPlatformError(error) ? error : fail('TOKEN_EXPIRED', 'kiotviet_token_unavailable');
    }
  }

  /** Một trang = một lần gọi mạng. */
  async function fetchPage(currentItem: number): Promise<z.infer<typeof envelopeSchema>> {
    const token = await tokenOf();
    const url = new URL(`${API_ORIGIN}/products`);
    url.searchParams.set('currentItem', String(currentItem));
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('includeInventory', 'true');
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          Retailer: retailer,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw fail('UNKNOWN', 'kiotviet_network_error');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw failureOfStatus(response);
    }
    try {
      return envelopeSchema.parse(JSON.parse(await readBoundedText(response)));
    } catch (error) {
      throw isPlatformError(error) ? error : fail('UNKNOWN', 'kiotviet_bad_response');
    }
  }

  return {
    async fetchCatalog() {
      const byId = new Map<string, Row>();
      let offset = 0;
      for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
        const { data, total } = await fetchPage(offset);
        const before = byId.size;
        for (const row of data) byId.set(row.id, row);
        offset += data.length;
        const done = data.length < pageSize || (total !== undefined && offset >= total);
        if (done) return { products: groupRows([...byId.values()]) };
        // Trang đầy mà không có dòng mới: API bỏ qua `currentItem` → dừng sớm, không trả danh mục không tin được.
        if (byId.size === before) throw fail('UNKNOWN', 'kiotviet_bad_response');
      }
      throw fail('UNKNOWN', 'kiotviet_too_many_pages');
    },
  };
}
