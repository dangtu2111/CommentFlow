import { normalizeAttrs, normalizeSearchText } from '@flow/shared';

/**
 * Bổ sung size/màu khách đã nêu mà `extract` bỏ sót (nhất là tiếng Việt không dấu: "ao thun basic L trang"). Hàm thuần, KHÔNG LLM, KHÔNG đồng nghĩa:
 * so từng từ trong câu khách (bỏ dấu, thường) với giá trị thuộc tính biến thể CỦA CHÍNH sản phẩm đã khớp (cùng chuẩn hóa `attrs_norm`). Chỉ nhận khi đúng MỘT giá trị của trục khớp;
 * khớp nhiều hoặc không khớp → giữ nguyên (null). Size một chữ cái ("s", "m", "l") chỉ nhận khi khách viết HOA ("L") hoặc đứng sau "size/sz/cỡ" — "m" thường là teencode "mình".
 */
export type AttrVariant = { attrsNorm: Record<string, string> };
export type AttrsFound = { size: string | null; color: string | null };

// Chỉ "size", "sz", "cỡ" (có dấu): "co" không dấu trùng "có" nên KHÔNG làm dấu hiệu.
const SIZE_MARKERS = new Set(['size', 'sz', 'cỡ']);

function distinctValues(variants: readonly AttrVariant[], axis: 'size' | 'color'): string[] {
  return [
    ...new Set(
      variants.flatMap((variant) => variant.attrsNorm[axis] ?? []).filter((v) => v !== ''),
    ),
  ];
}

/** Vị trí (chỉ số từ) của cụm tên sản phẩm đã khớp trong câu: [đầu, cuối]; không thấy → null. So khớp theo từ đã bỏ dấu. */
function phraseSpan(words: readonly string[], mentions: readonly string[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const mention of mentions) {
    const phrase = normalizeSearchText(mention)
      .split(' ')
      .filter((word) => word !== '');
    if (phrase.length === 0) continue;
    for (let start = 0; start + phrase.length <= words.length; start += 1) {
      if (phrase.every((word, offset) => words[start + offset] === word)) {
        spans.push([start, start + phrase.length - 1]);
      }
    }
  }
  return spans;
}

/**
 * Màu viết KHÔNG dấu qua bí danh ("den" = đen, "trang" = trắng) trùng nhiều từ thường ("ship den Ha Noi", "den khi nao"): chỉ nhận khi (i) từ liền trước là "mau", hoặc (ii) đứng LIỀN KỀ một size đã nhận,
 * hoặc (iii) đứng LIỀN KỀ cụm tên sản phẩm đã khớp (`mentions`). Màu có dấu đúng ("đen", "trắng") và tên tiếng Anh ("white") nhận như cũ.
 */
export function inferAttrsFromText(
  text: string,
  variants: readonly AttrVariant[],
  known: AttrsFound,
  mentions: readonly string[] = [],
): AttrsFound {
  const rawWords = text.split(/[\s,;.!?()]+/).filter((word) => word !== '');
  const words = rawWords.map((word) => normalizeSearchText(word));
  const found: AttrsFound = { ...known };
  let sizeIndex = -1;
  for (const axis of ['size', 'color'] as const) {
    if (known[axis] !== null) continue;
    const candidates = distinctValues(variants, axis);
    if (candidates.length === 0) continue;
    const spans = axis === 'color' ? phraseSpan(words, mentions) : [];
    const hits = new Map<string, { raw: string; index: number }>();
    // Mọi giá trị trục khách nhắc tới (kể cả từ bị loại vì thiếu ngữ cảnh): từ hai giá trị trở lên → mơ hồ, không đoán.
    const mentioned = new Set<string>();
    words.forEach((word, index) => {
      if (word === '') return;
      const raw = rawWords[index] as string;
      const value = normalizeAttrs({ [axis]: word })[axis];
      if (value === undefined || !candidates.includes(value)) return;
      if (axis === 'color') mentioned.add(value);
      if (axis === 'size' && value.length === 1) {
        const shownUpper = raw === value.toUpperCase();
        const afterMarker =
          index > 0 && SIZE_MARKERS.has((rawWords[index - 1] as string).toLowerCase());
        if (!shownUpper && !afterMarker) return;
      }
      if (axis === 'color' && value !== word && normalizeSearchText(raw) === raw.toLowerCase()) {
        // Không dấu + qua bí danh: cần dấu hiệu ngữ cảnh.
        const afterMau = index > 0 && words[index - 1] === 'mau';
        const nearSize = sizeIndex >= 0 && Math.abs(index - sizeIndex) <= 1;
        const nearName = spans.some(([start, end]) => index === end + 1 || index === start - 1);
        if (!afterMau && !nearSize && !nearName) return;
      }
      hits.set(value, { raw, index });
    });
    // Trả CHÍNH chữ khách viết ("L", "trang"): các bước sau tự chuẩn hóa như `attrs_norm`; ảnh chụp extract khớp với cách nhãn gold ghi.
    if (hits.size === 1 && (axis !== 'color' || mentioned.size === 1)) {
      const [hit] = [...hits.values()] as [{ raw: string; index: number }];
      found[axis] = hit.raw;
      if (axis === 'size') sizeIndex = hit.index;
    }
  }
  return found;
}
