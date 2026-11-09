import { normalizeAttrs, normalizeSearchText } from '@flow/shared';

/**
 * Bổ sung size/màu khách đã nêu mà `extract` bỏ sót (nhất là tiếng Việt không dấu: "ao thun basic L trang"). Hàm thuần, KHÔNG LLM, KHÔNG đồng nghĩa:
 * so từng từ trong câu khách (bỏ dấu, thường) với giá trị thuộc tính biến thể CỦA CHÍNH sản phẩm đã khớp (cùng chuẩn hóa `attrs_norm`). Chỉ nhận khi đúng MỘT giá trị của trục khớp;
 * khớp nhiều hoặc không khớp → giữ nguyên (null). Size một chữ cái ("s", "m", "l") chỉ nhận khi khách viết HOA ("L") hoặc đứng sau "size/sz/cỡ" — "m" thường là teencode "mình".
 */
export type AttrVariant = { attrsNorm: Record<string, string> };
export type AttrsFound = { size: string | null; color: string | null };

const SIZE_MARKERS = new Set(['size', 'sz', 'co']);

function distinctValues(variants: readonly AttrVariant[], axis: 'size' | 'color'): string[] {
  return [
    ...new Set(
      variants.flatMap((variant) => variant.attrsNorm[axis] ?? []).filter((v) => v !== ''),
    ),
  ];
}

export function inferAttrsFromText(
  text: string,
  variants: readonly AttrVariant[],
  known: AttrsFound,
): AttrsFound {
  const rawWords = text.split(/[\s,;.!?()]+/).filter((word) => word !== '');
  const words = rawWords.map((word) => normalizeSearchText(word));
  const found: AttrsFound = { ...known };
  for (const axis of ['size', 'color'] as const) {
    if (known[axis] !== null) continue;
    const candidates = distinctValues(variants, axis);
    if (candidates.length === 0) continue;
    const hits = new Map<string, string>();
    words.forEach((word, index) => {
      if (word === '') return;
      const value = normalizeAttrs({ [axis]: word })[axis];
      if (value === undefined || !candidates.includes(value)) return;
      if (axis === 'size' && value.length === 1) {
        const shownUpper = rawWords[index] === value.toUpperCase();
        const afterMarker = index > 0 && SIZE_MARKERS.has(words[index - 1] as string);
        if (!shownUpper && !afterMarker) return;
      }
      hits.set(value, rawWords[index] as string);
    });
    // Trả CHÍNH chữ khách viết ("L", "trang"): các bước sau tự chuẩn hóa như `attrs_norm`; ảnh chụp extract khớp với cách nhãn gold ghi.
    if (hits.size === 1) found[axis] = [...hits.values()][0] as string;
  }
  return found;
}
