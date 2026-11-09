import { AppError, COMMENT_LABELS, type CommentLabel } from '@flow/shared';
import { z } from 'zod';
import { FACT_TOPICS } from '../fact-plan/types';

/**
 * Kết quả bước `extract` (FR-162): MỘT object có cấu trúc, mọi bước sau chỉ đọc object này.
 * Đọc đầu ra LLM → kiểm Zod → chuẩn hóa bằng code (nhãn chính do code chọn, nguyên tắc #9).
 * Tên trường giữ snake_case đúng spec (lưu `drafts.extracted` jsonb).
 */

const optionalText = z
  .string()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  });

const textList = z
  .array(z.string())
  .transform((items) => items.map((item) => item.trim()).filter((item) => item !== ''));

const optionalNumber = z.number().positive().nullable();

/**
 * Nhãn do LLM trả: CHỈ tên nhãn. Số `confidence` mà mô hình tự ghi (nếu có) bị BỎ — không được dùng làm `p_label`
 * (docs/09 §6.0, FR-163: "không dùng số model tự ghi"). Xác suất nhãn lấy từ ml → logprob → tự nhất quán
 * (`label-signal.ts`), không từ đây.
 */
const labelSchema = z
  .object({ label: z.enum(COMMENT_LABELS) })
  .transform(({ label }): { label: CommentLabel } => ({ label }));

/** Gộp nhãn trùng, giữ THỨ TỰ mô hình trả (nhãn đầu = nhãn chính, FR-145). */
function normalizeLabels(labels: { label: CommentLabel }[]): { label: CommentLabel }[] {
  const seen = new Set<CommentLabel>();
  return labels.filter(({ label }) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

export const extractResultSchema = z.object({
  labels: z.array(labelSchema).min(1).transform(normalizeLabels),
  product_mentions: textList,
  refers_to_image: z.boolean(),
  size: optionalText,
  color: optionalText,
  height_cm: optionalNumber,
  weight_kg: optionalNumber,
  qty: z.number().int().positive().nullable(),
  cited_price_vnd: z.number().int().positive().nullable(),
  order_intent: z
    .object({
      items: textList,
      // LLM chỉ thấy văn bản đã che nên không thể biết số thật: giá trị nó trả bị bỏ; số thật do
      // PII-MASK-PIPE giữ (lưu Khách tiềm năng trước khi che) rồi điền vào sau.
      phone: z.unknown().transform((): string | null => null),
      address: optionalText,
    })
    .nullable(),
  asks: textList,
  /** Chủ đề sự kiện câu hỏi THẬT SỰ hỏi (enum). Thiếu (dữ liệu cũ) → rỗng. */
  topics: z.array(z.enum(FACT_TOPICS)).default([]),
  /** Nơi khách muốn giao tới (chỉ tên nơi, vd. "Canada", "Hawaii", "Hà Nội"); chỉ để tra bảng quốc gia/tỉnh. */
  destination: optionalText.optional().transform((value) => value ?? null),
});

export type ExtractResult = z.output<typeof extractResultSchema>;

const FENCE = /^```[a-z]*\s*|\s*```$/gi;

export const EXTRACT_UNREADABLE_MESSAGE = 'Kết quả phân loại của AI không đọc được.';

function unreadable(): AppError {
  // Không đính kèm nội dung khách hay đầu ra thô vào thông báo (nguyên tắc #6).
  return new AppError('LLM_UNAVAILABLE', EXTRACT_UNREADABLE_MESSAGE);
}

/** Lấy object JSON đầu ra LLM (bỏ hàng rào ```json và chữ thừa), kiểm schema. */
export function parseExtractOutput(text: string): ExtractResult {
  const unfenced = text.trim().replace(FENCE, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw unreadable();

  let raw: unknown;
  try {
    raw = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw unreadable();
  }
  const parsed = extractResultSchema.safeParse(raw);
  if (!parsed.success) throw unreadable();
  return parsed.data;
}

/** Nhãn chính = nhãn đầu danh sách đã sắp (FR-145). */
export function primaryLabel(result: ExtractResult): CommentLabel {
  // `labels` luôn ≥ 1 phần tử nhờ schema.
  return (result.labels[0] as { label: CommentLabel }).label;
}

/** Có nhãn này ở BẤT KỲ vị trí nào (cổng chặn kiểm mọi nhãn, FR-145). */
export function hasLabel(result: ExtractResult, label: CommentLabel): boolean {
  return result.labels.some((item) => item.label === label);
}
