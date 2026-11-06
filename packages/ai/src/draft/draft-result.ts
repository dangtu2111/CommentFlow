import { AppError } from '@flow/shared';
import { z } from 'zod';

/**
 * Kết quả bước `draft` (FR-029, FR-140): JSON `{reply, lang, sources[], claims[], unanswered_topics[],
 * needs_human, reason}`. Đọc đầu ra LLM → kiểm Zod → kiểm nguồn của từng ý bằng code (AI chỉ soạn câu).
 * Tên trường giữ snake_case đúng spec (lưu `drafts` jsonb).
 */

export const CLAIM_KINDS = ['fact', 'greeting', 'question_back', 'handoff'] as const;
export const DRAFT_LANGS = ['vi', 'en'] as const;
export type DraftLang = (typeof DRAFT_LANGS)[number];

export const REASON_MISSING_SOURCE = 'Thiếu nguồn';
export const REASON_MODEL_HANDOFF = 'AI đề nghị chuyển nhân viên';

const cleanList = z
  .array(z.string())
  .transform((items) => items.map((item) => item.trim()).filter((item) => item !== ''));

const claimSchema = z.object({
  text: z.string(),
  source_ids: z.array(z.string()),
  kind: z.enum(CLAIM_KINDS),
});

export const draftResultSchema = z
  .object({
    reply: z.string(),
    lang: z.enum(DRAFT_LANGS),
    sources: cleanList.transform((ids) => [...new Set(ids)]),
    claims: z.array(claimSchema),
    unanswered_topics: cleanList,
    needs_human: z.boolean(),
    reason: z.string().default(''),
    /** Cách diễn đạt khác của cùng nội dung (FR-161); chưa kiểm — `guardVariants` lọc ở `drafter.ts`. */
    variants: cleanList.default([]),
  })
  .refine((value) => value.needs_human || value.reply.trim() !== '')
  .transform((value) => ({
    ...value,
    reply: value.reply.trim(),
    reason:
      value.needs_human && value.reason.trim() === '' ? REASON_MODEL_HANDOFF : value.reason.trim(),
  }));

export type DraftResult = z.output<typeof draftResultSchema>;

const FENCE = /^```[a-z]*\s*|\s*```$/gi;

function unreadable(): AppError {
  // Không đính kèm đầu ra thô hay nội dung khách vào thông báo (nguyên tắc #6).
  return new AppError('LLM_UNAVAILABLE', 'Câu trả lời soạn của AI không đọc được.');
}

/** Lấy object JSON đầu ra LLM (bỏ hàng rào ```json và chữ thừa), kiểm schema. */
export function parseDraftOutput(text: string): DraftResult {
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
  const parsed = draftResultSchema.safeParse(raw);
  if (!parsed.success) throw unreadable();
  return parsed.data;
}

/** Kết quả "Cần nhân viên": không câu trả lời, không nguồn. */
export function needsHumanResult(reason: string, lang: DraftLang = 'vi'): DraftResult {
  return {
    reply: '',
    lang,
    sources: [],
    claims: [],
    unanswered_topics: [],
    needs_human: true,
    reason,
    variants: [],
  };
}

/**
 * FR-140: mỗi ý `fact` phải trỏ ≥ 1 nguồn và mọi id (trong ý lẫn `sources[]`) phải thuộc tập nguồn ĐÃ đưa
 * vào prompt; vi phạm → `needs_human`, lý do "Thiếu nguồn", bỏ câu trả lời. Đã `needs_human` sẵn thì giữ nguyên.
 */
export function enforceClaimSources(
  result: DraftResult,
  allowedSourceIds: ReadonlySet<string>,
): DraftResult {
  if (result.needs_human) return result;
  const known = (ids: readonly string[]) => ids.every((id) => allowedSourceIds.has(id));
  const factsOk = result.claims.every(
    (claim) => claim.kind !== 'fact' || (claim.source_ids.length > 0 && known(claim.source_ids)),
  );
  if (factsOk && known(result.sources)) return result;
  return { ...result, reply: '', needs_human: true, reason: REASON_MISSING_SOURCE, variants: [] };
}
