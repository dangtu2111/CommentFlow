import {
  type ShopSuggestionField,
  type ShopSuggestionInsert,
  shopSuggestionInsertSchema,
} from './shop-profile';

/**
 * Đề xuất thông tin shop (KB-SHOP-V2 PR5) do CODE dựng — không gửi LLM, không đoán:
 *  - `extractContactSuggestions`: tách hotline/email/website/Zalo/Shopee/TikTok bằng regex trên văn bản gốc CHƯA che (ở bên trong tiến trình, không ra ngoài).
 *  - `shopifyShopToSuggestions`: đổi thông tin cửa hàng Shopify thành đề xuất.
 * Mọi giá trị đi qua `shopSuggestionInsertSchema` (≤ 500 ký tự, không số tiền); không đạt → bỏ. Chỉ là bản NHÁP chờ Owner Áp dụng/Bỏ.
 */
type Lang = ShopSuggestionInsert['lang'];

const PHONE = /(?<![\w+])\+?\d[\d\s.-]{7,15}\d(?!\w)/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const URL_LIKE = /(?:https?:\/\/|(?:www\.)?(?:zalo\.me|shopee\.vn|tiktok\.com)\/)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
const EVIDENCE_MAX = 500;
/** Số đứng ngay sau cụm này là mã số thuế, không phải điện thoại. */
const TAX_ID_LABEL = /(?:thuế|\bmst\b|mã số)[\s:.-]*$/i;

/** Số điện thoại di động VN: 10 số bắt đầu 03/05/07/08/09, hoặc +84/84 + 9 số. */
function isVietnamMobile(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  return /^0[35789]\d{8}$/.test(local);
}

function urlField(url: string): ShopSuggestionField | null {
  const host = url.replace(/^https?:\/\//i, '').toLowerCase();
  if (/^(?:www\.)?zalo\.me\//.test(host)) return 'zalo';
  if (/^(?:www\.)?(?:shopee\.vn|shp\.ee)\//.test(host)) return 'shopee';
  if (/^(?:[a-z]+\.)?tiktok\.com\//.test(host)) return 'tiktok';
  return /^https?:\/\//i.test(url) ? 'website' : null;
}

/** Dòng chứa chỗ khớp (≤ 500 ký tự, luôn là chuỗi con NGUYÊN VĂN của văn bản). */
function evidenceOf(text: string, index: number, length: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const endBreak = text.indexOf('\n', index + length);
  const end = endBreak === -1 ? text.length : endBreak;
  const line = text.slice(start, end);
  if (line.trim().length <= EVIDENCE_MAX) return line.trim();
  const from = Math.max(start, index - 100);
  return text.slice(from, Math.min(end, from + EVIDENCE_MAX)).trim();
}

export function extractContactSuggestions(
  text: string,
  options: { lang: Lang; sourceRef?: string },
): ShopSuggestionInsert[] {
  const found = new Map<ShopSuggestionField, { value: string; index: number }>();
  const take = (field: ShopSuggestionField, value: string, index: number) => {
    if (!found.has(field)) found.set(field, { value, index });
  };
  for (const m of text.matchAll(PHONE)) {
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 20), at);
    if (isVietnamMobile(m[0]) && !TAX_ID_LABEL.test(before)) take('hotline', m[0].trim(), at);
  }
  for (const m of text.matchAll(EMAIL)) take('email', m[0], m.index ?? 0);
  for (const m of text.matchAll(URL_LIKE)) {
    const url = m[0].replace(TRAILING_PUNCTUATION, '');
    const field = urlField(url);
    if (field) take(field, url, m.index ?? 0);
  }
  const out: ShopSuggestionInsert[] = [];
  for (const [field, { value, index }] of found) {
    const parsed = shopSuggestionInsertSchema.safeParse({
      lang: options.lang,
      field,
      value,
      evidenceQuote: evidenceOf(text, index, value.length),
      source: 'kb_text',
      ...(options.sourceRef ? { sourceRef: options.sourceRef } : {}),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export type ShopifyShopInfo = {
  name: string | null;
  contactEmail: string | null;
  primaryDomainUrl: string | null;
  description: string | null;
  billingAddress: {
    address1?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
};

export function shopifyShopToSuggestions(
  shop: ShopifyShopInfo,
  lang: Lang,
): ShopSuggestionInsert[] {
  const address = [
    shop.billingAddress?.address1,
    shop.billingAddress?.city,
    shop.billingAddress?.province,
    shop.billingAddress?.country,
  ]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(', ');
  const candidates: Array<[ShopSuggestionField, string | null | undefined]> = [
    ['name', shop.name],
    ['email', shop.contactEmail],
    ['website', shop.primaryDomainUrl],
    ['description', shop.description],
    ['address', address],
  ];
  const out: ShopSuggestionInsert[] = [];
  for (const [field, raw] of candidates) {
    const value = raw?.trim() ?? '';
    if (value === '') continue;
    const parsed = shopSuggestionInsertSchema.safeParse({
      lang,
      field,
      value,
      source: 'shopify',
      sourceRef: 'shop',
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

const CONTACT_TEXT_MAX = 200;

/** Nối giá trị vào ô "Liên hệ công khai" (hotline/email chung một ô): trống → đặt; đã chứa → giữ; vượt 200 ký tự → `null` (không áp dụng được). */
export function mergeContactText(current: string | null, add: string): string | null {
  const base = current?.trim() ?? '';
  if (base === '') return add.length <= CONTACT_TEXT_MAX ? add : null;
  if (base.includes(add)) return base;
  const merged = `${base}; ${add}`;
  return merged.length <= CONTACT_TEXT_MAX ? merged : null;
}
