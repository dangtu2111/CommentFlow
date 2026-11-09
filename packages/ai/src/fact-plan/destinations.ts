import { normalizeSearchText } from '@flow/shared';
import { findProvinces } from './regions';

/**
 * Nơi giao hàng khách nêu ("ship to Canada/Hawaii") → mã quốc gia ISO. Tiểu bang/lãnh thổ Mỹ thuộc `US`; tỉnh/thành Việt Nam thuộc `VN` (từ điển `regions.ts`). Không nhận ra hoặc nêu
 * nhiều quốc gia khác nhau → `null` (không đoán). Tên hiển thị do CODE chọn theo ngôn ngữ khách (không chép chữ của khách vào câu).
 */
export type Place = { country: string; label: string };

const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
  'District of Columbia',
  'Puerto Rico',
  'Guam',
  'US Virgin Islands',
  'American Samoa',
  'Northern Mariana Islands',
] as const;

type Country = { code: string; en: string; vi: string; aliases: readonly string[] };

const COUNTRIES: readonly Country[] = [
  {
    code: 'US',
    en: 'the United States',
    vi: 'Mỹ',
    aliases: ['united states', 'usa', 'u s a', 'us', 'america', 'my', 'hoa ky'],
  },
  { code: 'VN', en: 'Vietnam', vi: 'Việt Nam', aliases: ['vietnam', 'viet nam'] },
  { code: 'CA', en: 'Canada', vi: 'Canada', aliases: ['canada'] },
  { code: 'MX', en: 'Mexico', vi: 'Mexico', aliases: ['mexico'] },
  {
    code: 'GB',
    en: 'the United Kingdom',
    vi: 'Anh',
    aliases: ['united kingdom', 'uk', 'england', 'great britain', 'anh quoc'],
  },
  { code: 'AU', en: 'Australia', vi: 'Úc', aliases: ['australia', 'uc'] },
  { code: 'NZ', en: 'New Zealand', vi: 'New Zealand', aliases: ['new zealand'] },
  { code: 'DE', en: 'Germany', vi: 'Đức', aliases: ['germany', 'duc'] },
  { code: 'FR', en: 'France', vi: 'Pháp', aliases: ['france', 'phap'] },
  { code: 'IT', en: 'Italy', vi: 'Ý', aliases: ['italy'] },
  { code: 'ES', en: 'Spain', vi: 'Tây Ban Nha', aliases: ['spain', 'tay ban nha'] },
  { code: 'JP', en: 'Japan', vi: 'Nhật Bản', aliases: ['japan', 'nhat ban', 'nhat'] },
  {
    code: 'KR',
    en: 'South Korea',
    vi: 'Hàn Quốc',
    aliases: ['south korea', 'korea', 'han quoc', 'han'],
  },
  { code: 'CN', en: 'China', vi: 'Trung Quốc', aliases: ['china', 'trung quoc'] },
  { code: 'SG', en: 'Singapore', vi: 'Singapore', aliases: ['singapore'] },
  { code: 'TH', en: 'Thailand', vi: 'Thái Lan', aliases: ['thailand', 'thai lan'] },
  { code: 'MY', en: 'Malaysia', vi: 'Malaysia', aliases: ['malaysia'] },
  { code: 'ID', en: 'Indonesia', vi: 'Indonesia', aliases: ['indonesia'] },
  { code: 'PH', en: 'the Philippines', vi: 'Philippines', aliases: ['philippines'] },
  { code: 'IN', en: 'India', vi: 'Ấn Độ', aliases: ['india', 'an do'] },
  { code: 'BR', en: 'Brazil', vi: 'Brazil', aliases: ['brazil'] },
  {
    code: 'NL',
    en: 'the Netherlands',
    vi: 'Hà Lan',
    aliases: ['netherlands', 'holland', 'ha lan'],
  },
  { code: 'SE', en: 'Sweden', vi: 'Thụy Điển', aliases: ['sweden', 'thuy dien'] },
  { code: 'CH', en: 'Switzerland', vi: 'Thụy Sĩ', aliases: ['switzerland', 'thuy si'] },
  { code: 'IE', en: 'Ireland', vi: 'Ireland', aliases: ['ireland'] },
  {
    code: 'AE',
    en: 'the United Arab Emirates',
    vi: 'UAE',
    aliases: ['uae', 'dubai', 'united arab emirates'],
  },
  { code: 'HK', en: 'Hong Kong', vi: 'Hồng Kông', aliases: ['hong kong', 'hongkong'] },
  { code: 'TW', en: 'Taiwan', vi: 'Đài Loan', aliases: ['taiwan', 'dai loan'] },
];

/** Từ ngắn dễ trùng chữ thường ("my", "us", "uc", "han", "anh", "nhat") chỉ nhận khi đứng sau từ chỉ nơi ("ship to us", "gửi sang Úc"). */
const AMBIGUOUS = new Set(['us', 'my', 'uc', 'han', 'nhat', 'anh quoc', 'uk', 'duc', 'phap']);
const LOCATOR = /(?:^| )(?:to|ship to|deliver to|den|toi|sang|ve|ra|vao|di|gui|giao)(?: |$)/;

const statePatterns = US_STATES.map((name) => ({
  name,
  norm: ` ${normalizeSearchText(name)} `,
}));

const countryOf = (code: string): Country | undefined => COUNTRIES.find((c) => c.code === code);

/** Tên quốc gia theo ngôn ngữ khách (cho câu do code viết). */
export function countryName(code: string, lang: 'vi' | 'en'): string {
  const country = countryOf(code);
  return country ? country[lang] : code;
}

/** Nơi khách nêu → quốc gia; nhiều quốc gia khác nhau hoặc không nhận ra → `null`. */
export function resolvePlace(text: string): Place | null {
  const normalized = ` ${normalizeSearchText(text)} `;
  const found = new Map<string, string>();
  // Tiểu bang/lãnh thổ Mỹ (chuỗi đủ dài; "washington", "virginia" mơ hồ nhưng vẫn thuộc US).
  for (const state of statePatterns) {
    if (normalized.includes(state.norm)) found.set('US', state.name);
  }
  for (const country of COUNTRIES) {
    for (const alias of country.aliases) {
      if (!normalized.includes(` ${alias} `)) continue;
      if (AMBIGUOUS.has(alias) && !LOCATOR.test(normalized)) continue;
      found.set(
        country.code,
        country.code === 'US' && found.has('US') ? (found.get('US') as string) : alias,
      );
    }
  }
  if (findProvinces(text).length > 0 && !found.has('VN')) found.set('VN', 'Vietnam');
  if (found.size !== 1) return null;
  const [code, label] = [...found.entries()][0] as [string, string];
  const country = countryOf(code);
  return { country: code, label: country ? country.en : label };
}
