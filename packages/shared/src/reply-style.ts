/**
 * Cài đặt ngôn ngữ trả lời và xưng hô (docs/05 FR-120, FR-142). Phần thuần: tập giá trị hợp lệ + kiểm tổ hợp theo
 * ngôn ngữ, dùng chung cho giao diện, Server Action và (sau này) `guard`. Không đoán giới tính; không có giá trị mặc
 * định theo tên khách.
 */
export const REPLY_LANGUAGES = ['auto', 'vi', 'en'] as const;
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];

/** `auto` = theo ngôn ngữ khách (nhận diện ở docs/09 §5); `vi`/`en` = ép một ngôn ngữ. */
export function parseReplyLanguage(value: unknown): ReplyLanguage | null {
  return typeof value === 'string' && (REPLY_LANGUAGES as readonly string[]).includes(value)
    ? (value as ReplyLanguage)
    : null;
}

export const SHOP_PRONOUNS = ['em', 'shop', 'minh', 'custom'] as const;
export type ShopPronoun = (typeof SHOP_PRONOUNS)[number];

/** Cách gọi khách theo ngôn ngữ giọng văn (FR-142): tiếng Anh chỉ có `you`. */
export const CUSTOMER_ADDRESSES = {
  vi: ['anh_chi', 'ban', 'quy_khach'],
  en: ['you'],
} as const;
export type AddressLanguage = keyof typeof CUSTOMER_ADDRESSES;

export type AddressChoice = {
  shop: ShopPronoun;
  customer: string;
  /** Chỉ dùng (và bắt buộc) khi `shop = 'custom'` (tên shop). */
  shopCustom?: string;
};

export function isValidAddress(lang: AddressLanguage, choice: AddressChoice): boolean {
  if (!(SHOP_PRONOUNS as readonly string[]).includes(choice.shop)) return false;
  if (!(CUSTOMER_ADDRESSES[lang] as readonly string[]).includes(choice.customer)) return false;
  const custom = choice.shopCustom?.trim() ?? '';
  return choice.shop === 'custom' ? custom.length > 0 : choice.shopCustom === undefined;
}
