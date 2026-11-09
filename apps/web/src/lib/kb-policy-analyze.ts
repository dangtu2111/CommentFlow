import { type PolicySuggestion, suggestPolicyFacts } from '@flow/ai';

/**
 * Phân tách DỮ LIỆU THÔ (chính sách văn bản đã nạp, ví dụ từ Shopify) thành giá trị có cấu trúc: dùng đúng bộ đề xuất của worker (`suggestPolicyFacts`, quy tắc thuần, không LLM). Mỗi giá trị
 * mang nguyên văn câu làm bằng chứng; câu mơ hồ/mâu thuẫn bị bỏ; kết quả chỉ là BẢN NHÁP chờ Owner duyệt. Hàm thuần.
 */
export type RawPolicyText = { title: string; content: string };

/** Trần tổng độ dài văn bản đưa vào bộ phân tách (chống tốn CPU); phần vượt bị bỏ. */
export const MAX_ANALYZE_CHARS = 100_000;

export function analyzePolicyTexts(items: readonly RawPolicyText[]): {
  textCount: number;
  suggestions: PolicySuggestion[];
} {
  const texts = items.map((item) => item.content.trim()).filter((content) => content !== '');
  const joined = texts.join('\n\n').slice(0, MAX_ANALYZE_CHARS);
  return { textCount: texts.length, suggestions: joined === '' ? [] : suggestPolicyFacts(joined) };
}
