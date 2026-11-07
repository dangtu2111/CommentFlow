import { COMMENT_LABELS } from '@flow/shared';
import { z } from 'zod';

/**
 * Bộ mẫu đánh giá (docs/14 §4.1, FR-165). Mỗi dòng JSONL là một mẫu: bình luận ĐÃ che PII + đáp án đúng do người gán
 * (nhãn, hành động, thông tin cần tách, sự kiện bắt buộc, điều cấm, xưng hô). `source: 'synthetic'` = sinh tự động, CHỈ để chạy
 * thử runner — KHÔNG dùng để chọn model hay báo đạt cổng (cần bộ ~300 mẫu `real`).
 */
export const LANG_GROUPS = ['vi', 'vi_plain', 'en', 'mixed'] as const;
export type LangGroup = (typeof LANG_GROUPS)[number];

/** Tên nhóm hiển thị (docs/14 §4.1). */
export const LANG_GROUP_LABELS: Record<LangGroup, string> = {
  vi: 'Tiếng Việt có dấu',
  vi_plain: 'Tiếng Việt không dấu/teencode',
  en: 'Tiếng Anh',
  mixed: 'Câu trộn Việt–Anh',
};

export const CATEGORIES = ['normal', 'legal', 'clarify', 'safety'] as const;
export type Category = (typeof CATEGORIES)[number];

export const ACTIONS = ['answer', 'clarify', 'redirect', 'handoff'] as const;

const extractExpectation = z
  .object({
    product_mentions: z.array(z.string()).optional(),
    size: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    qty: z.number().int().nullable().optional(),
  })
  .strict();

export const evalSampleSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.enum(['synthetic', 'real']),
  group: z.enum(LANG_GROUPS),
  category: z.enum(CATEGORIES).default('normal'),
  text: z.string().min(1).max(2000),
  hasMedia: z.boolean().default(false),
  expected: z.object({
    lang: z.enum(['vi', 'en']),
    label: z.enum(COMMENT_LABELS),
    action: z.enum(ACTIONS),
    /** Chỉ kiểm các trường có mặt ở đây. */
    extract: extractExpectation.default({}),
    /** Sự kiện bắt buộc có trong câu trả lời (so khớp không phân biệt hoa/thường, bỏ dấu). */
    mustContain: z.array(z.string()).default([]),
    /** Điều cấm (giá sai, hứa ngoài chính sách, làm theo injection…): không được xuất hiện trong câu trả lời. */
    forbidden: z.array(z.string()).default([]),
  }),
});
export type EvalSample = z.infer<typeof evalSampleSchema>;

/** Đọc JSONL; lỗi nêu SỐ DÒNG (không in nội dung mẫu). Trùng `id` bị từ chối. Dòng trống bỏ qua. */
export function parseDataset(jsonl: string): EvalSample[] {
  const samples: EvalSample[] = [];
  const seen = new Set<string>();
  jsonl.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') return;
    const lineNo = index + 1;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`Dòng ${lineNo}: không phải JSON hợp lệ.`);
    }
    const parsed = evalSampleSchema.safeParse(raw);
    if (!parsed.success) {
      const where = parsed.error.issues[0]?.path.join('.') || '(gốc)';
      throw new Error(`Dòng ${lineNo}: sai định dạng ở "${where}".`);
    }
    if (seen.has(parsed.data.id)) throw new Error(`Dòng ${lineNo}: trùng id "${parsed.data.id}".`);
    seen.add(parsed.data.id);
    samples.push(parsed.data);
  });
  return samples;
}

export function serializeDataset(samples: readonly EvalSample[]): string {
  return `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`;
}
