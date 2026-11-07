/**
 * `brand_voice` của workspace (docs/10, bảng `cf.brand_voice`, một dòng/ngôn ngữ) → giọng văn cho bước soạn (`DraftVoice`).
 * Hàm thuần. Dòng có xưng hô/cách gọi không hợp lệ bị BỎ (không đoán) — nơi gọi quay về giọng mặc định.
 */
import { type AddressLanguage, isValidAddress, type ShopPronoun } from '@flow/shared';
import type { DraftVoice } from '../draft/draft-prompt';

export type BrandVoiceRow = {
  lang: 'vi' | 'en';
  tone: string | null;
  greeting: string | null;
  signOff: string | null;
  doRules: readonly string[];
  dontRules: readonly string[];
  shopPronoun: string;
  shopPronounCustom: string | null;
  customerAddress: string;
};

export type DraftVoicesByLang = Partial<Record<'vi' | 'en', DraftVoice>>;

const MAX_RULES = 20;

function cleanRules(rules: readonly string[]): string[] {
  return rules
    .map((rule) => rule.trim())
    .filter((rule) => rule !== '')
    .slice(0, MAX_RULES);
}

function rowToVoice(row: BrandVoiceRow): DraftVoice | null {
  const custom = row.shopPronounCustom?.trim();
  const valid = isValidAddress(
    row.lang as AddressLanguage,
    {
      shop: row.shopPronoun,
      customer: row.customerAddress,
      ...(row.shopPronoun === 'custom' ? { shopCustom: custom } : {}),
    } as Parameters<typeof isValidAddress>[1],
  );
  if (!valid) return null;
  return {
    ...(row.tone ? { tone: row.tone } : {}),
    ...(row.greeting ? { greeting: row.greeting } : {}),
    ...(row.signOff ? { signOff: row.signOff } : {}),
    do: cleanRules(row.doRules),
    dont: cleanRules(row.dontRules),
    shopPronoun: row.shopPronoun as ShopPronoun,
    ...(row.shopPronoun === 'custom' && custom ? { shopPronounCustom: custom } : {}),
    customerAddress: row.customerAddress as DraftVoice['customerAddress'],
  };
}

export function draftVoicesFromRows(rows: readonly BrandVoiceRow[]): DraftVoicesByLang {
  const voices: DraftVoicesByLang = {};
  for (const row of rows) {
    const voice = rowToVoice(row);
    if (voice) voices[row.lang] = voice;
  }
  return voices;
}
