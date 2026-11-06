import { COMMENT_LABELS, type CommentLabel } from '@flow/shared';
import { z } from 'zod';
import type { AnswerExample, ExampleStatus, ExampleStore } from './example-store';
import {
  buildExampleTemplate,
  type ExampleRejectCode,
  type ExampleVariant,
  fillExampleTemplate,
  sanitizeExampleText,
} from './example-template';

/** Số mẫu tối đa mỗi workspace (docs/10 `kb_answer_examples`). */
export const EXAMPLE_CAP = 2000;
/** Số mẫu đưa vào prompt soạn (FR-132: 2–3 mẫu). */
export const EXAMPLE_PICK_LIMIT = 3;

export interface ExamplesDeps {
  readonly store: ExampleStore;
  readonly newId: () => string;
  readonly now: () => Date;
  /** Đọc biến thể HIỆN TẠI từ `product_variants` (không từ cache/vector). */
  readonly loadVariants: (
    workspaceId: string,
    variantIds: readonly string[],
  ) => Promise<readonly ExampleVariant[]>;
}

/** Chỉ câu nhân viên gửi nguyên văn (duyệt bản AI không sửa) hoặc đã sửa — không lấy câu AI tự gửi. */
const CAPTURE_SOURCES = ['staff_verbatim', 'staff_edited'] as const;

const captureSchema = z.object({
  workspaceId: z.string().min(1),
  channelId: z.string().min(1).nullable(),
  label: z.enum(COMMENT_LABELS),
  lang: z.enum(['vi', 'en']),
  question: z.string().max(2000),
  answer: z.string().max(2000),
  source: z.enum(CAPTURE_SOURCES),
  sourceDraftId: z.string().min(1).nullable(),
  approvedBy: z.string().min(1),
  variants: z.array(
    z.object({
      id: z.string().min(1),
      priceVnd: z.number().int().nonnegative(),
      stock: z.number().int().nonnegative().nullable(),
    }),
  ),
});

export interface CaptureInput {
  readonly workspaceId: string;
  readonly channelId: string | null;
  readonly label: CommentLabel;
  readonly lang: 'vi' | 'en';
  /** Câu hỏi/bình luận của khách (chưa che; được che trước khi lưu). */
  readonly question: string;
  /** Câu nhân viên đã gửi. */
  readonly answer: string;
  readonly source: (typeof CAPTURE_SOURCES)[number];
  readonly sourceDraftId: string | null;
  readonly approvedBy: string;
  /** Biến thể của sản phẩm mà câu nói đến. */
  readonly variants: readonly ExampleVariant[];
}

export type CaptureResult =
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false;
      readonly code: ExampleRejectCode | 'EXAMPLE_INVALID_INPUT' | 'EXAMPLE_DUPLICATE';
    };

/** Biến câu nhân viên đã gửi thành mẫu (đã che PII, giá/tồn là placeholder) rồi lưu. */
export async function captureAnswerExample(
  input: CaptureInput,
  deps: ExamplesDeps,
): Promise<CaptureResult> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'EXAMPLE_INVALID_INPUT' };
  const valid = parsed.data;

  const built = buildExampleTemplate(valid.answer, valid.variants);
  if (!built.ok) return built;
  const question = sanitizeExampleText(valid.question);
  if (!question.ok) return question;

  const existing = await deps.store.list(valid.workspaceId);
  const duplicate = existing.some(
    (e) =>
      e.status === 'active' &&
      e.label === valid.label &&
      e.lang === valid.lang &&
      e.channelId === valid.channelId &&
      e.answerTemplate === built.template,
  );
  if (duplicate) return { ok: false, code: 'EXAMPLE_DUPLICATE' };

  const example: AnswerExample = {
    id: deps.newId(),
    workspaceId: valid.workspaceId,
    channelId: valid.channelId,
    label: valid.label,
    lang: valid.lang,
    questionMasked: question.text,
    answerTemplate: built.template,
    variantIds: built.variantIds,
    sourceDraftId: valid.sourceDraftId,
    approvedBy: valid.approvedBy,
    status: 'active',
    usedCount: 0,
    createdAt: deps.now(),
  };
  await deps.store.insert(example);
  await enforceCap(valid.workspaceId, example.id, deps.store);
  return { ok: true, id: example.id };
}

/** Vượt trần → bỏ mẫu ít dùng nhất, cùng số lần dùng thì cũ nhất; không bao giờ bỏ mẫu vừa thêm. */
async function enforceCap(workspaceId: string, keepId: string, store: ExampleStore): Promise<void> {
  const rows = await store.list(workspaceId);
  const excess = rows.length - EXAMPLE_CAP;
  if (excess <= 0) return;
  const doomed = rows
    .filter((r) => r.id !== keepId)
    .sort((a, b) => a.usedCount - b.usedCount || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, excess)
    .map((r) => r.id);
  await store.remove(workspaceId, doomed);
}

export interface PickQuery {
  readonly workspaceId: string;
  readonly channelId: string | null;
  readonly label: CommentLabel;
  readonly lang: 'vi' | 'en';
}

/** Ví dụ giọng văn đưa vào prompt: câu hỏi đã che + câu trả lời đã điền giá/tồn hiện tại. */
export interface VoiceExample {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

/**
 * 2–3 mẫu `active` gần nhất cùng nhãn + ngôn ngữ (kênh trùng hoặc mọi kênh). Điền lại giá/tồn
 * hiện tại; mẫu có biến thể đã mất bị bỏ và lùi sang mẫu kế (docs/10 §5.4).
 */
export async function pickVoiceExamples(
  query: PickQuery,
  deps: ExamplesDeps,
): Promise<readonly VoiceExample[]> {
  const rows = await deps.store.list(query.workspaceId);
  const candidates = rows
    .filter(
      (e) =>
        e.status === 'active' &&
        e.label === query.label &&
        e.lang === query.lang &&
        (e.channelId === null || e.channelId === query.channelId),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const picked: VoiceExample[] = [];
  for (const example of candidates) {
    if (picked.length >= EXAMPLE_PICK_LIMIT) break;
    const variants = await deps.loadVariants(query.workspaceId, example.variantIds);
    const answer = fillExampleTemplate(example.answerTemplate, variants, example.lang);
    if (answer === null) continue;
    picked.push({ id: example.id, question: example.questionMasked, answer });
  }
  if (picked.length > 0) {
    await deps.store.incrementUsed(
      query.workspaceId,
      picked.map((p) => p.id),
    );
  }
  return picked;
}

/** Owner bật/tắt từng mẫu. Quyền Owner do nơi gọi kiểm; `false` = không có mẫu trong workspace này. */
export function setExampleStatus(
  workspaceId: string,
  id: string,
  status: ExampleStatus,
  deps: Pick<ExamplesDeps, 'store'>,
): Promise<boolean> {
  return deps.store.setStatus(workspaceId, id, status);
}
