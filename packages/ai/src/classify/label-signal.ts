import type { CommentLabel } from '@flow/shared';

/**
 * Xác suất nhãn `p_label` cho độ tin cậy (docs/09 §6.0, FR-163): thứ tự ưu tiên ml → logprob → tự nhất quán → null.
 * KHÔNG BAO GIỜ dùng số mô hình tự ghi trong JSON. Hàm thuần; không gọi mạng.
 */
export type LabelSignal = {
  /** Xác suất nhãn từ dịch vụ `ml` (nhánh phân loại ml). */
  ml?: number | null;
  /** Xác suất tích các token của giá trị nhãn chính, từ logprob của nhà cung cấp. */
  logprob?: number | null;
  /** Tỉ lệ các lần gọi độc lập cho cùng nhãn chính (tự nhất quán). */
  consistency?: number | null;
};

export type LabelProbability = {
  pLabel: number | null;
  source: 'ml' | 'logprob' | 'self_consistency' | null;
};

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Chọn nguồn đầu tiên hợp lệ theo thứ tự ml → logprob → tự nhất quán; không có → `null` (không đoán). */
export function resolveLabelProbability(signal: LabelSignal | undefined): LabelProbability {
  if (signal && isProbability(signal.ml)) return { pLabel: signal.ml, source: 'ml' };
  if (signal && isProbability(signal.logprob)) return { pLabel: signal.logprob, source: 'logprob' };
  if (signal && isProbability(signal.consistency)) {
    return { pLabel: signal.consistency, source: 'self_consistency' };
  }
  return { pLabel: null, source: null };
}

/** Tỉ lệ các lần chạy trùng nhãn chính với lần đầu (1 = nhất quán hoàn toàn). Rỗng → `null`. */
export function consistencyOf(primaries: readonly CommentLabel[]): number | null {
  const first = primaries[0];
  if (first === undefined) return null;
  return primaries.filter((label) => label === first).length / primaries.length;
}

export type TokenLogprob = { token: string; logprob: number };

/** Vị trí bắt đầu của giá trị nhãn ngay sau `"label": "` đầu tiên có đúng giá trị `label`; không có → -1. */
function findLabelValueStart(text: string, label: string): number {
  let from = 0;
  for (;;) {
    const key = text.indexOf('"label"', from);
    if (key === -1) return -1;
    let cursor = key + '"label"'.length;
    while (text[cursor] === ' ' || text[cursor] === '\n' || text[cursor] === '\t') cursor += 1;
    if (text[cursor] === ':') {
      cursor += 1;
      while (text[cursor] === ' ' || text[cursor] === '\n' || text[cursor] === '\t') cursor += 1;
      if (text[cursor] === '"' && text.startsWith(`${label}"`, cursor + 1)) return cursor + 1;
    }
    from = key + 1;
  }
}

/**
 * Xác suất của GIÁ TRỊ nhãn chính trong JSON đầu ra: tìm chuỗi `"label": "<nhãn>"` đầu tiên trong văn bản ghép từ
 * các token, lấy tích xác suất của các token nằm trong phần giá trị. Không tìm thấy/không có logprob → `null`.
 */
export function labelProbabilityFromLogprobs(
  tokens: readonly TokenLogprob[] | undefined,
  label: string,
): number | null {
  if (!tokens || tokens.length === 0) return null;
  let text = '';
  const spans = tokens.map((item) => {
    const start = text.length;
    text += item.token;
    return { start, end: text.length, logprob: item.logprob };
  });
  // Tên nhãn chỉ gồm chữ thường (COMMENT_LABELS) nên so khớp chuỗi thẳng, không cần regex/thoát ký tự.
  if (!/^[a-z_]+$/.test(label)) return null;
  const valueStart = findLabelValueStart(text, label);
  if (valueStart === -1) return null;
  const valueEnd = valueStart + label.length;
  const inside = spans.filter((span) => span.end > valueStart && span.start < valueEnd);
  if (inside.length === 0) return null;
  const total = inside.reduce((sum, span) => sum + span.logprob, 0);
  const probability = Math.exp(total);
  return isProbability(probability) ? probability : null;
}
