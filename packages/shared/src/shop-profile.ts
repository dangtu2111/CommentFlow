import { z } from 'zod';

/**
 * Thông tin cửa hàng v2 (KB-SHOP-V2, migration 0085): hình dạng và giới hạn của các trường mới. DB chỉ chặn TỔNG độ dài/số phần tử; từng giá trị (≤ 500 ký tự) và
 * "không số tiền" (giá chỉ đọc từ `products`/`product_variants`, nguyên tắc #4) do Zod kiểm ở ranh giới vào. Giờ lưu "HH:MM"; ngày lưu số 1–7 (1 = Thứ Hai … 7 = Chủ nhật).
 */
export const SHOP_VALUE_MAX = 500;
export const SHOP_BRANCHES_MAX = 10;
export const SHOP_INDUSTRIES_MAX = 10;

/** Số tiền trong chữ ("20.000đ", "30k", "199000 vnd", "$5"): KHÔNG được nằm trong thông tin cửa hàng. */
const MONEY = /(?:\d[\d.,]*\s*(?:đ|₫|k(?![\p{L}\p{N}])|vnd|vnđ|usd)|[$€£]\s*\d)/iu;

const text = (max = SHOP_VALUE_MAX) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !MONEY.test(value), { message: 'no_money' });
const requiredText = (max = SHOP_VALUE_MAX) => text(max).pipe(z.string().min(1));

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timeRange = z.object({ from: hhmm, to: hhmm }).strict();
const weekdays = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, { message: 'duplicate_day' });

export const shopHoursSchema = z
  .object({
    open: z.object({ days: weekdays, from: hhmm, to: hhmm }).strict().optional(),
    support: timeRange.optional(),
  })
  .strict();
export type ShopHours = z.infer<typeof shopHoursSchema>;

export const SHOP_CONTACT_KEYS = ['hotline', 'zalo', 'website', 'shopee', 'tiktok'] as const;
export const shopContactsSchema = z
  .object({
    hotline: text().optional(),
    zalo: text().optional(),
    website: text().optional(),
    shopee: text().optional(),
    tiktok: text().optional(),
  })
  .strict();
export type ShopContacts = z.infer<typeof shopContactsSchema>;

export const shopBranchSchema = z
  .object({
    name: requiredText(200),
    address: requiredText(),
    hours: text().optional(),
    note: text().optional(),
    is_main: z.boolean(),
  })
  .strict();
export type ShopBranch = z.infer<typeof shopBranchSchema>;

/** Tối đa 10 chi nhánh, tối đa MỘT chi nhánh chính. */
export const shopBranchesSchema = z
  .array(shopBranchSchema)
  .max(SHOP_BRANCHES_MAX)
  .refine((branches) => branches.filter((branch) => branch.is_main).length <= 1, {
    message: 'one_main_branch',
  });

export const shopIndustriesSchema = z
  .array(requiredText(100))
  .max(SHOP_INDUSTRIES_MAX)
  .refine((items) => items.join('|').length <= SHOP_VALUE_MAX, { message: 'too_long' });

/** Các trường MỚI của `shop_profiles` (PR4 dùng khi lưu form). Trường để trống = null. */
export const shopProfileV2Schema = z
  .object({
    slogan: text().nullable(),
    industries: shopIndustriesSchema,
    legalName: text().nullable(),
    taxId: text().nullable(),
    hours: shopHoursSchema.nullable(),
    contacts: shopContactsSchema.nullable(),
    branches: shopBranchesSchema,
  })
  .strict();
export type ShopProfileV2 = z.infer<typeof shopProfileV2Schema>;

export const SHOP_SUGGESTION_FIELDS = [
  'name',
  'slogan',
  'description',
  'address',
  'opening_hours',
  'legal_name',
  'tax_id',
  'hotline',
  'email',
  'website',
  'zalo',
  'shopee',
  'tiktok',
] as const;
export const SHOP_SUGGESTION_SOURCES = ['shopify', 'kb_text'] as const;
export const SHOP_SUGGESTION_STATUSES = ['draft', 'applied', 'rejected'] as const;
export type ShopSuggestionField = (typeof SHOP_SUGGESTION_FIELDS)[number];

/**
 * Đề xuất do HỆ THỐNG chèn (luôn `draft`): ≤ 500 ký tự, không số tiền; nguồn `kb_text` bắt buộc có trích dẫn nguyên văn.
 * Trường `description` được phép dài tới 500 ký tự như mọi giá trị (đề xuất ngắn gọn; Owner sửa tiếp ở form).
 */
export const shopSuggestionInsertSchema = z
  .object({
    lang: z.enum(['vi', 'en', 'all']),
    field: z.enum(SHOP_SUGGESTION_FIELDS),
    value: requiredText(),
    evidenceQuote: z.string().trim().min(1).max(SHOP_VALUE_MAX).optional(),
    source: z.enum(SHOP_SUGGESTION_SOURCES),
    sourceRef: z.string().trim().max(SHOP_VALUE_MAX).optional(),
  })
  .strict()
  .refine((item) => item.source !== 'kb_text' || item.evidenceQuote !== undefined, {
    message: 'evidence_required',
    path: ['evidenceQuote'],
  });
export type ShopSuggestionInsert = z.infer<typeof shopSuggestionInsertSchema>;
