export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';
/** Tên cookie lưu ngôn ngữ người dùng (không đặt tiền tố /vi /en trên URL). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Chọn ngôn ngữ từ giá trị cookie; thiếu hoặc sai thì dùng mặc định. */
export function resolveLocale(cookieValue: string | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}

/**
 * Chọn ngôn ngữ: cookie (người dùng đã chọn) > header `Accept-Language` (mặc định theo trình duyệt, FR-119)
 * > tiếng Việt. Chỉ xét ngôn ngữ ưu tiên cao nhất trong header mà ta hỗ trợ.
 */
export function negotiateLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = Number(
        params
          .find((p) => p.trim().startsWith('q='))
          ?.trim()
          .slice(2) ?? '1',
      );
      return { primary: tag.trim().toLowerCase().split('-')[0] ?? '', q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);
  const match = ranked.find((entry) => isLocale(entry.primary));
  return match && isLocale(match.primary) ? match.primary : DEFAULT_LOCALE;
}
