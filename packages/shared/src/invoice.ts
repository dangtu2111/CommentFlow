import { z } from 'zod';
import { AppError } from './errors';
import { USAGE_PRODUCTS } from './usage';

/**
 * Hóa đơn và thanh toán thủ công (FR-091/FR-102, docs/10 §3.6): phần THUẦN, không chạm DB. Bảng thật là
 * `core.invoices`/`core.payments` (migration 0052), chỉ ghi qua hàm DEFINER của hệ thống. Mọi số tiền là số nguyên VND;
 * AI không tham gia (nguyên tắc #4): tổng tiền do code tính từ các mục.
 */

export const INVOICE_PRODUCTS = USAGE_PRODUCTS;
export type InvoiceProduct = (typeof INVOICE_PRODUCTS)[number];

export const INVOICE_STATUSES = ['pending', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Trần tổng tiền một hóa đơn: cột DB là integer; chặn giá trị vô lý/tràn số. */
export const INVOICE_MAX_AMOUNT_VND = 1_000_000_000;
export const INVOICE_ITEMS_MAX = 20;
export const INVOICE_ITEM_DESCRIPTION_MAX = 200;
export const INVOICE_ITEM_QUANTITY_MAX = 1000;

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(INVOICE_ITEM_DESCRIPTION_MAX),
  quantity: z.number().int().min(1).max(INVOICE_ITEM_QUANTITY_MAX),
  unitPriceVnd: z.number().int().min(0).max(INVOICE_MAX_AMOUNT_VND),
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

const itemsSchema = z.array(invoiceItemSchema).min(1).max(INVOICE_ITEMS_MAX);

/** Tổng tiền = Σ số lượng × đơn giá. Mục sai, tổng ≤ 0 hoặc vượt trần → `AppError` (không đoán). */
export function computeInvoiceTotal(items: readonly InvoiceItem[]): number {
  const parsed = itemsSchema.safeParse(items);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Các mục hóa đơn không hợp lệ.');
  }
  const total = parsed.data.reduce((sum, i) => sum + i.quantity * i.unitPriceVnd, 0);
  if (total < 1 || total > INVOICE_MAX_AMOUNT_VND) {
    throw new AppError('VALIDATION_FAILED', 'Tổng tiền hóa đơn nằm ngoài khoảng cho phép.');
  }
  return total;
}

const createInvoiceSchema = z.object({
  workspaceId: z.uuid(),
  product: z.enum(INVOICE_PRODUCTS),
  items: itemsSchema,
  dueAt: z.date().refine((d) => !Number.isNaN(d.getTime())),
});

export type CreateInvoiceInput = {
  workspaceId: string;
  product: InvoiceProduct;
  items: InvoiceItem[];
  dueAt: Date;
  /** Tính từ `items` bằng `computeInvoiceTotal`, không do nơi gọi truyền. */
  amountVnd: number;
};

/** Kiểm đầu vào tạo hóa đơn và tính tổng tiền. */
export function parseCreateInvoice(input: unknown): CreateInvoiceInput {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Đầu vào tạo hóa đơn không hợp lệ.');
  }
  return { ...parsed.data, amountVnd: computeInvoiceTotal(parsed.data.items) };
}

const confirmPaymentSchema = z.object({
  workspaceId: z.uuid(),
  invoiceId: z.uuid(),
  amountVnd: z.number().int().min(1).max(INVOICE_MAX_AMOUNT_VND),
  /** Mã giao dịch ngân hàng: cắt khoảng trắng, viết hoa (DB cũng chuẩn hóa như vậy). */
  bankRef: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((s) => s.toUpperCase()),
  rawStatement: z.string().max(2000).nullish(),
  confirmedBy: z.uuid().nullish(),
});

export type ConfirmPaymentParsed = {
  workspaceId: string;
  invoiceId: string;
  amountVnd: number;
  bankRef: string;
  rawStatement: string | null;
  confirmedBy: string | null;
};

/** Kiểm đầu vào xác nhận thanh toán (ranh giới vào): sai → `AppError`, không để lộ mã lỗi Postgres thô. */
export function parseConfirmPayment(input: unknown): ConfirmPaymentParsed {
  const parsed = confirmPaymentSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Đầu vào xác nhận thanh toán không hợp lệ.');
  }
  const { rawStatement, confirmedBy, ...rest } = parsed.data;
  return { ...rest, rawStatement: rawStatement ?? null, confirmedBy: confirmedBy ?? null };
}

/** 32 ký tự, bỏ I/O/0/1 để người chuyển khoản không gõ nhầm. */
export const TRANSFER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRANSFER_CODE_BODY_LENGTH = 8;
const TRANSFER_PREFIX: Record<InvoiceProduct, string> = { commentflow: 'CF', excelflow: 'XF' };
const TRANSFER_CODE_SOURCE = '(?:CF|XF)[A-HJ-NP-Z2-9]{8}';
const TRANSFER_CODE_EXACT = new RegExp(`^${TRANSFER_CODE_SOURCE}$`);

/**
 * Sinh nội dung chuyển khoản định danh: tiền tố theo sản phẩm + 8 ký tự (32^8 ≈ 10^12). `randomBytes` truyền vào để
 * test được (production: `crypto.getRandomValues`); `byte & 31` cho phân phối đều vì bảng chữ có đúng 32 ký tự.
 * Trùng mã (cực hiếm) bị DB từ chối bằng unique → nơi gọi sinh lại.
 */
export function generateTransferCode(
  product: InvoiceProduct,
  randomBytes: (length: number) => Uint8Array,
): string {
  const bytes = randomBytes(TRANSFER_CODE_BODY_LENGTH);
  if (bytes.length !== TRANSFER_CODE_BODY_LENGTH) {
    throw new AppError('INTERNAL', 'Nguồn ngẫu nhiên trả sai số byte.');
  }
  let body = '';
  for (const byte of bytes) body += TRANSFER_CODE_ALPHABET[byte & 31];
  return `${TRANSFER_PREFIX[product]}${body}`;
}

export function isTransferCode(value: string): boolean {
  return TRANSFER_CODE_EXACT.test(value);
}

/**
 * Tìm mã chuyển khoản trong nội dung sao kê (ngân hàng hay đổi hoa/thường, chèn khoảng trắng/gạch): gộp ký tự chữ-số
 * rồi quét MỌI vị trí (có thể trả vài ứng viên chồng nhau; ứng viên sai không khớp hóa đơn nào nên vô hại). Trả mã duy
 * nhất theo thứ tự xuất hiện; người xác nhận (Admin) vẫn là người quyết định cuối.
 */
export function extractTransferCodes(statementText: string): string[] {
  const compact = statementText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const found = new Set<string>();
  for (const m of compact.matchAll(new RegExp(`(?=(${TRANSFER_CODE_SOURCE}))`, 'g'))) {
    found.add(m[1] as string);
  }
  return [...found];
}

export type PaymentVerdict = 'ok' | 'amount_mismatch' | 'already_paid' | 'void';

/**
 * Đối soát một khoản tiền với hóa đơn (FR-102): chỉ hóa đơn `pending` + ĐÚNG số tiền mới `ok`. Lệch tiền không tự
 * đánh dấu đã trả — người xác nhận xử lý tay (cảnh báo lệch tiền).
 */
export function evaluatePayment(
  invoice: { status: InvoiceStatus; amountVnd: number },
  paidVnd: number,
): PaymentVerdict {
  if (invoice.status === 'paid') return 'already_paid';
  if (invoice.status === 'void') return 'void';
  return invoice.amountVnd === paidVnd ? 'ok' : 'amount_mismatch';
}
