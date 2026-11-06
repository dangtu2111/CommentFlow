/**
 * Phản hồi của nhân viên với gợi ý AI (FR-043): "gửi nguyên văn" hay "đã sửa" + khoảng cách sửa, để ghi vào
 * `drafts` (`status`, `final_text`, `edit_distance` — docs/10) và hiệu chuẩn về sau. Hàm thuần, không I/O.
 * Chip nguồn: dựng danh sách chip hiển thị từ `drafts.sources` (id đoạn kiến thức).
 */

/** Số chip nguồn tối đa hiển thị; phần còn lại gộp thành "+N". */
export const SOURCE_CHIP_MAX = 5;
const CHIP_LABEL_MAX = 40;

/** Chuẩn hóa để so bản AI với bản gửi: xuống dòng về `\n`, bỏ khoảng trắng đầu/cuối. */
export function normalizeReplyText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/** Khoảng cách Levenshtein theo ký tự Unicode (không tách cặp surrogate). */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return prev[y.length] ?? 0;
}

export type DraftOutcome = {
  status: 'sent_as_is' | 'edited';
  finalText: string;
  editDistance: number;
};

/** So bản AI với bản gửi (cùng chuẩn hóa). Khác từng ký tự (kể cả hoa/thường, dấu) → `edited`. */
export function classifyDraftOutcome(aiText: string, sentText: string): DraftOutcome {
  const ai = normalizeReplyText(aiText);
  const finalText = normalizeReplyText(sentText);
  const distance = editDistance(ai, finalText);
  return { status: distance === 0 ? 'sent_as_is' : 'edited', finalText, editDistance: distance };
}

export type SourceChip = {
  id: string;
  /** Tên đoạn kiến thức; `null` = chưa biết tên (giao diện hiện nhãn dự phòng đã dịch). */
  label: string | null;
};

function truncateLabel(label: string): string {
  const chars = [...label.trim()];
  return chars.length <= CHIP_LABEL_MAX
    ? chars.join('')
    : `${chars.slice(0, CHIP_LABEL_MAX - 1).join('')}…`;
}

/** Id nguồn (giữ thứ tự, bỏ trùng/rỗng) → ≤ `SOURCE_CHIP_MAX` chip + số còn lại. Không phải mảng → không chip. */
export function buildSourceChips(
  sourceIds: unknown,
  titles: Readonly<Record<string, string>>,
): { chips: SourceChip[]; more: number } {
  if (!Array.isArray(sourceIds)) return { chips: [], more: 0 };
  const unique = [
    ...new Set(sourceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  const chips = unique.slice(0, SOURCE_CHIP_MAX).map((id) => {
    const title = Object.hasOwn(titles, id) ? titles[id]?.trim() : '';
    return { id, label: title ? truncateLabel(title) : null };
  });
  return { chips, more: unique.length - chips.length };
}
