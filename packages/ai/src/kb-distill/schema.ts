import { z } from 'zod';
import type { LlmCallInput } from '../llm-client';

/** Số mục tối đa model được đề xuất cho MỘT đoạn nguồn (chặn đầu ra tràn lan). */
export const DISTILL_MAX_ITEMS_PER_CHUNK = 6;

/** Loại đề xuất: `faq` = hỏi/đáp; `product_attr` = thuộc tính sản phẩm (lưu dạng FAQ nháp, KHÔNG ghi thẳng vào bảng sản phẩm). Giá/tồn kho không thuộc phạm vi. */
export const DISTILL_KINDS = ['faq', 'product_attr'] as const;
export type DistillKind = (typeof DISTILL_KINDS)[number];

export const distillItemSchema = z.object({
  kind: z.enum(DISTILL_KINDS),
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(1500),
  /** Câu trích NGUYÊN VĂN từ đoạn nguồn làm bằng chứng; code kiểm chuỗi con nguyên văn. */
  evidenceQuote: z.string().trim().min(8).max(1000),
});
export type DistillItem = z.infer<typeof distillItemSchema>;

export const distillOutputSchema = z.object({
  items: z.array(z.unknown()).max(DISTILL_MAX_ITEMS_PER_CHUNK * 2),
});

export const DISTILL_RESPONSE_FORMAT: NonNullable<LlmCallInput['responseFormat']> = {
  name: 'cf_distill',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: DISTILL_MAX_ITEMS_PER_CHUNK,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'question', 'answer', 'evidenceQuote'],
          properties: {
            kind: { type: 'string', enum: [...DISTILL_KINDS] },
            question: { type: 'string' },
            answer: { type: 'string' },
            evidenceQuote: { type: 'string' },
          },
        },
      },
    },
  },
};

/** Đọc đầu ra thô của LLM: JSON hỏng → `null` (đoạn bị bỏ qua, đếm `invalid_output`). Mục sai cấu trúc được lọc riêng ở `parseDistillItems`. */
export function parseDistillItems(
  text: string,
): { items: DistillItem[]; malformed: number } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const outer = distillOutputSchema.safeParse(raw);
  if (!outer.success) return null;
  const items: DistillItem[] = [];
  let malformed = 0;
  for (const candidate of outer.data.items.slice(0, DISTILL_MAX_ITEMS_PER_CHUNK)) {
    const parsed = distillItemSchema.safeParse(candidate);
    if (parsed.success) items.push(parsed.data);
    else malformed += 1;
  }
  return { items, malformed };
}
