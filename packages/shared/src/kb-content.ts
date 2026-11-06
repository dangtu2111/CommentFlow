import { z } from 'zod';
import { type AddressLanguage, isValidAddress, SHOP_PRONOUNS } from './reply-style';

/**
 * Kiểm đầu vào cho bốn phần kiến thức nhập tay (docs/05 FR-050, FR-142): thông tin cửa hàng, chính sách, FAQ, giọng
 * văn + quy tắc trả lời. Phần thuần, dùng chung cho Server Action, import và worker lập chỉ mục. Không chứa giá/tồn
 * (nguyên tắc #4: đọc từ `products`).
 */
export const CONTENT_LANGS = ['vi', 'en', 'all'] as const;
export type ContentLang = (typeof CONTENT_LANGS)[number];
export const VOICE_LANGS = ['vi', 'en'] as const;

/** `all` áp dụng cho cả hai ngôn ngữ (FR-050: vi/en/cả hai). */
export function expandContentLang(lang: ContentLang): Array<'vi' | 'en'> {
  return lang === 'all' ? ['vi', 'en'] : [lang];
}

export const POLICY_KINDS = ['shipping', 'return', 'warranty', 'payment', 'other'] as const;
export const HANDOFF_TOPICS = [
  'shipping',
  'discount',
  'order_status',
  'stock_check',
  'other',
] as const;

export const TEXT_SHORT_MAX = 200;
export const TEXT_LONG_MAX = 8000;
export const BRAND_VOICE_LIST_MAX = 20;
export const FAQ_TAGS_MAX = 10;

/** Cắt khoảng trắng; chuỗi rỗng → null (cột tùy chọn). */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const required = (max: number) => z.string().trim().min(1).max(max);
const lang3 = z.enum(CONTENT_LANGS);

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => v || null)
  .refine((v) => {
    if (v === null) return true;
    try {
      const { protocol } = new URL(v);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'website phải là http(s)');

export const shopProfileSchema = z.object({
  lang: lang3,
  name: required(TEXT_SHORT_MAX),
  description: optional(2000),
  address: optional(500),
  openingHours: optional(500),
  contact: optional(TEXT_SHORT_MAX),
  website: httpUrl,
});
export type ShopProfileInput = z.infer<typeof shopProfileSchema>;
export const parseShopProfile = (v: unknown) => shopProfileSchema.safeParse(v);

export const policyItemSchema = z.object({
  kind: z.enum(POLICY_KINDS),
  lang: lang3,
  title: required(TEXT_SHORT_MAX),
  content: required(TEXT_LONG_MAX),
});
export type PolicyItemInput = z.infer<typeof policyItemSchema>;
export const parsePolicyItem = (v: unknown) => policyItemSchema.safeParse(v);

const tags = z
  .array(z.string().max(50))
  .max(FAQ_TAGS_MAX)
  .default([])
  .transform((list) => [...new Set(list.map((t) => t.trim().toLowerCase()).filter(Boolean))]);

export const faqItemSchema = z.object({
  question: required(1000),
  answer: required(TEXT_LONG_MAX),
  lang: lang3,
  tags,
});
export type FaqItemInput = z.infer<typeof faqItemSchema>;
export const parseFaqItem = (v: unknown) => faqItemSchema.safeParse(v);

const ruleList = z
  .array(z.string().max(500))
  .max(BRAND_VOICE_LIST_MAX * 2)
  .default([])
  .transform((list) => list.map((r) => r.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(500)).max(BRAND_VOICE_LIST_MAX));

const handoffTemplate = z.object({ inHours: required(1000), outHours: required(1000) });
const handoffTemplates = z
  .record(z.string(), handoffTemplate)
  .default({})
  .refine(
    (rec) => Object.keys(rec).every((k) => (HANDOFF_TOPICS as readonly string[]).includes(k)),
    'chủ đề câu mời không hợp lệ',
  );

/** Giọng văn theo ngôn ngữ (FR-050, FR-142) + quy tắc nên/không nên + câu mời chuyển người (FR-141, FR-152). */
export const brandVoiceSchema = z
  .object({
    lang: z.enum(VOICE_LANGS),
    tone: optional(500),
    greeting: optional(500),
    signOff: optional(500),
    doRules: ruleList,
    dontRules: ruleList,
    addressByName: z.boolean().default(false),
    shopPronoun: z.enum(SHOP_PRONOUNS),
    shopPronounCustom: z.string().trim().max(60).optional(),
    customerAddress: z.string(),
    handoffTemplates,
  })
  .superRefine((v, ctx) => {
    const ok = isValidAddress(v.lang as AddressLanguage, {
      shop: v.shopPronoun,
      customer: v.customerAddress,
      ...(v.shopPronounCustom === undefined ? {} : { shopCustom: v.shopPronounCustom }),
    });
    if (!ok)
      ctx.addIssue({ code: 'custom', path: ['customerAddress'], message: 'xưng hô không hợp lệ' });
  });
export type BrandVoiceInput = z.infer<typeof brandVoiceSchema>;
export const parseBrandVoice = (v: unknown) => brandVoiceSchema.safeParse(v);
