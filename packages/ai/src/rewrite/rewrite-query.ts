import type { MaskedText } from '@flow/shared';

/** Caption bài được rút gọn ở mức này khi ghép (FR-137). */
export const MAX_CAPTION_CHARS = 200;
/** Trần độ dài `search_query` (chống phình truy vấn). */
export const MAX_QUERY_CHARS = 400;
/** Câu có số từ ≤ ngưỡng này coi là quá ngắn để tìm kiếm (FR-137). */
export const SHORT_COMMENT_MAX_WORDS = 6;
const SEPARATOR = ' | ';
/** Từ chỉ định/đại từ làm câu phụ thuộc ngữ cảnh ("áo này", "mẫu đó", "nó còn không"). */
const DEICTIC_WORDS: ReadonlySet<string> = new Set(['này', 'đó', 'đấy', 'ấy', 'kia', 'nó', 'vậy']);

/** Đầu vào đều là văn bản ĐÃ che PII (nguyên tắc #6). */
export type RuleQueryInput = {
  comment: MaskedText;
  parentComment?: MaskedText;
  postCaption?: MaskedText;
  productName?: MaskedText;
};

function tidy(text: string | undefined): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function words(text: string): string[] {
  const clean = tidy(text);
  return clean === '' ? [] : clean.toLowerCase().split(' ');
}

/**
 * `search_query` theo quy tắc, không tốn LLM (FR-137): bình luận + cha + caption (rút gọn) + tên sản
 * phẩm gắn bài; bỏ phần rỗng/trùng. Câu gốc của khách KHÔNG bị thay (dùng để soạn trả lời).
 */
export function buildRuleQuery(input: RuleQueryInput): MaskedText {
  const parts = [
    tidy(input.comment),
    tidy(input.parentComment),
    tidy(input.postCaption).slice(0, MAX_CAPTION_CHARS),
    tidy(input.productName),
  ];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (part === '' || seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(SEPARATOR).slice(0, MAX_QUERY_CHARS) as MaskedText;
}

/**
 * Chỉ gọi LLM rẻ khi câu ≤ 6 từ hoặc nhiều nghĩa (có từ chỉ định) VÀ chưa nhận được sản phẩm (FR-137).
 * Câu rỗng → không (không có gì để viết lại).
 */
export function needsLlmRewrite(input: { comment: MaskedText; productKnown: boolean }): boolean {
  if (input.productKnown) return false;
  const tokens = words(input.comment);
  if (tokens.length === 0) return false;
  return tokens.length <= SHORT_COMMENT_MAX_WORDS || tokens.some((w) => DEICTIC_WORDS.has(w));
}
