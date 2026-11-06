/**
 * Từ khóa nội dung cấm (docs/09 §11.2: cờ bạc, vay tiền, hàng cấm…). Danh sách khởi đầu NHỎ và chỉnh được ở nơi gọi;
 * Admin duyệt/mở rộng sau. Khớp bằng code (không do AI chấm): bỏ dấu, không phân biệt hoa/thường, theo ranh giới từ.
 */
export const DEFAULT_BANNED_KEYWORDS: readonly string[] = [
  'vay tiền',
  'cờ bạc',
  'cá độ',
  'lô đề',
  'tín dụng đen',
  'hàng cấm',
];

export type ScanItem = { id: string; text: string };
/** Chỉ id + từ khóa khớp — KHÔNG mang nội dung (nội dung có thể chứa thông tin khách). */
export type BannedKeywordHit = { id: string; keyword: string };

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scanBannedKeywords(
  items: readonly ScanItem[],
  keywords: readonly string[] = DEFAULT_BANNED_KEYWORDS,
): BannedKeywordHit[] {
  const patterns = keywords
    .map((keyword) => ({ keyword, folded: fold(keyword) }))
    .filter((k) => k.folded !== '')
    .map(({ keyword, folded }) => ({
      keyword,
      re: new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(folded)}(?:$|[^a-z0-9])`),
    }));
  const hits: BannedKeywordHit[] = [];
  for (const item of items) {
    const text = fold(item.text);
    const match = patterns.find((p) => p.re.test(text));
    if (match) hits.push({ id: item.id, keyword: match.keyword });
  }
  return hits;
}
