import type { DistillItem } from './schema';

/**
 * Kiểm CỨNG một đề xuất chắt lọc bằng code (không tin model): mục không đạt bị bỏ và đếm theo lý do.
 *  - `quote_not_in_source`: `evidenceQuote` không phải chuỗi con NGUYÊN VĂN của đoạn nguồn (chỉ bỏ qua khác biệt khoảng trắng/xuống dòng).
 *  - `digit_not_in_quote`: có chữ số trong câu hỏi/đáp mà không có trong câu trích (không số nào do model bịa).
 *  - `money_in_answer`: có số tiền (giá chỉ lấy từ `products`, nguyên tắc #4).
 *  - `placeholder_in_text`: chứa chỗ giữ chỗ `{fact:…}`/`{src:…}` (dành riêng cho code).
 */
export type DistillRejection =
  | 'quote_not_in_source'
  | 'digit_not_in_quote'
  | 'money_in_answer'
  | 'placeholder_in_text';

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Nhóm chữ số liền nhau; "30.000" / "30,000" tính là một số `30000`. */
export function digitGroups(text: string): string[] {
  const joined = text.replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1');
  return joined.match(/\d+/g) ?? [];
}

const MONEY =
  /\d[\d.,]*\s*(?:đ|₫|vnd|vnđ|k|nghìn|ngàn|triệu|tr)(?![\p{L}\d])|(?:giá|phí)\s*:?\s*\d/iu;

export function verifyDistillItem(item: DistillItem, sourceText: string): DistillRejection | null {
  if (/\{(?:fact|src):/i.test(`${item.question}\n${item.answer}`)) return 'placeholder_in_text';
  const quote = collapse(item.evidenceQuote);
  if (!sourceText.includes(item.evidenceQuote) && !collapse(sourceText).includes(quote)) {
    return 'quote_not_in_source';
  }
  const inQuote = new Set(digitGroups(item.evidenceQuote));
  const claimed = digitGroups(`${item.question}\n${item.answer}`);
  if (claimed.some((group) => !inQuote.has(group))) return 'digit_not_in_quote';
  if (MONEY.test(item.answer) || MONEY.test(item.question)) return 'money_in_answer';
  return null;
}
