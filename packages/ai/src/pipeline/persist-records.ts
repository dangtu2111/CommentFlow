import type { NewDraft } from '@flow/db/runtime';
import {
  buildPriceSnapshot,
  type KbGapInput,
  type KbGapTopic,
  type PriceSource,
  type RetrievalLogInput,
} from '@flow/shared';
import type { PipelineResult } from './run-pipeline';

/**
 * Dựng các bản ghi sẽ ghi vào DB từ kết quả `runPipeline` (PIPE-ORCHESTRATOR lát D). HÀM THUẦN, không chạm DB. Văn bản đưa vào đây đã
 * ĐƯỢC CHE PII từ đầu (pipeline che trước mọi bước); `buildRetrievalLogRecord`/`buildKbGapRecord` che lần nữa khi dựng bản ghi.
 */
export type DonePipelineResult = Extract<PipelineResult, { status: 'done' }>;

export type PersistContext = {
  commentId: string;
  /** Số phiên bản kiến thức ĐÃ xuất bản đã dùng (null = chưa có). */
  kbVersionNumber: number | null;
  model: string | null;
  promptVersion: string | null;
  traceId: string | null;
};

/** Câu giữ chỗ cho bản nháp "Cần nhân viên" (cột `drafts.text` bắt buộc có chữ). Không phải câu gửi cho khách. */
export const HANDOFF_PLACEHOLDER_TEXT = 'Cần nhân viên xem câu này.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (id: string): boolean => UUID.test(id);
/** Ứng viên đoạn kiến thức có id dạng `kb:<uuid>` (`createKbTryKnowledge`); nhật ký chỉ lưu phần uuid. */
const chunkIdOf = (id: string): string => id.replace(/^kb:/, '');
/** `drafts`/`retrieval_logs` chỉ nhận vi/en; ngôn ngữ khác → `vi` (bản nháp khi đó luôn cần người). */
const storedLang = (lang: DonePipelineResult['lang']): 'vi' | 'en' => (lang === 'en' ? 'en' : 'vi');

const needsHuman = (result: DonePipelineResult): boolean =>
  result.decision.needsHuman || result.draft.needs_human || result.confidence.needsHuman;

/** Hành động quyết định bởi CODE (`decideAction`); `handoff` luôn cần người. */
const finalStatus = (result: DonePipelineResult): 'pending_review' | 'needs_human' =>
  needsHuman(result) || result.decision.action === 'handoff' ? 'needs_human' : 'pending_review';

/** Ảnh chụp giá/tồn lúc soạn (FR-111): chỉ nguồn sản phẩm ĐÃ DÙNG trong câu; mục không có giá VND (kể cả ngoại tệ) bị bỏ. */
function snapshotSources(result: DonePipelineResult): PriceSource[] {
  return result.candidates.flatMap((c) => (c.used ? (c.priceSources ?? []) : []));
}

export function toDraftInput(result: DonePipelineResult, ctx: PersistContext): NewDraft {
  const reply = result.reply.trim();
  return {
    targetType: 'comment',
    targetId: ctx.commentId,
    text: reply === '' ? HANDOFF_PLACEHOLDER_TEXT : result.reply,
    lang: storedLang(result.lang),
    sources: [...result.draft.sources],
    confidence: result.confidence.confidence,
    needsHuman: needsHuman(result),
    reason: result.decision.reason,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    kbVersion: ctx.kbVersionNumber,
    action: result.decision.action,
    variants: [...result.variants],
    claims: [...result.draft.claims],
    unansweredTopics: [...result.decision.unansweredTopics],
    traceId: ctx.traceId,
    priceSnapshot: buildPriceSnapshot(snapshotSources(result)),
    extracted: result.extract,
    confidenceComponents: result.confidence.components,
    contextRefs: [
      {
        type: 'thread',
        clarify_count: result.thread.clarifyCount,
        repeat_count: result.thread.repeatCount,
        human_holding: result.thread.humanHolding,
      },
    ],
  };
}

export function toRetrievalInput(
  result: DonePipelineResult,
  ctx: PersistContext,
  latencyMs: number,
): RetrievalLogInput {
  // Chỉ ứng viên có id dạng uuid (đoạn kiến thức) vào nhật ký; điểm từng nhánh chưa có nên để rỗng.
  const chunks = result.candidates
    .filter((c) => c.kind === 'kb' && isUuid(chunkIdOf(c.id)))
    .map((c) => ({ ...c, id: chunkIdOf(c.id) }));
  const products = result.candidates.filter((c) => c.kind === 'product' && isUuid(c.id));
  return {
    query: result.maskedText,
    ...(result.searchQuery ? { searchQuery: result.searchQuery } : {}),
    lang: storedLang(result.lang),
    route: result.route,
    kbVersion: ctx.kbVersionNumber,
    commentId: ctx.commentId,
    candidates: chunks.map((c) => ({
      chunkId: c.id,
      vecRank: null,
      ftsRank: null,
      trgmRank: null,
      rerankScore: c.score,
    })),
    usedChunkIds: chunks.filter((c) => c.used).map((c) => c.id),
    resolvedProductIds: products.map((c) => c.id),
    latencyMs: Math.max(0, Math.round(latencyMs)),
  };
}

/** Mỗi chủ đề khách hỏi mà chưa có nguồn → một lỗ hổng; chỉ gắn sản phẩm khi nhận ra ĐÚNG MỘT sản phẩm. */
export function toGapInputs(result: DonePipelineResult): KbGapInput[] {
  const products = result.candidates.filter((c) => c.kind === 'product' && isUuid(c.id));
  const productId = products.length === 1 ? (products[0]?.id ?? null) : null;
  return result.decision.unansweredTopics.map((topic: KbGapTopic) => ({
    topic,
    sampleQuestion: result.maskedText,
    productId,
  }));
}

export type CommentUpdate = {
  status: 'pending_review' | 'needs_human';
  label: DonePipelineResult['label'];
  labels: ReadonlyArray<{ label: string }>;
  lang: 'vi' | 'en' | null;
  textNormalized: string;
  needsFollowup: boolean;
  followupTopics: string[];
};

export function commentUpdateOf(result: DonePipelineResult): CommentUpdate {
  const topics = [...result.decision.unansweredTopics];
  return {
    status: finalStatus(result),
    label: result.label,
    labels: result.labels.map((l) => ({ label: l.label })),
    lang: result.lang === 'other' ? null : result.lang,
    textNormalized: result.normalizedText,
    needsFollowup: topics.length > 0,
    followupTopics: topics,
  };
}

/** Bản nháp "Cần nhân viên" cho lượt bị chặn (hết lượt/hết lần thử) hoặc AI trả đầu ra không đọc được. KHÔNG phải câu gửi khách. */
export function handoffDraftInput(reason: string, ctx: PersistContext): NewDraft {
  return {
    targetType: 'comment',
    targetId: ctx.commentId,
    text: HANDOFF_PLACEHOLDER_TEXT,
    lang: 'vi',
    sources: [],
    confidence: null,
    needsHuman: true,
    reason,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    kbVersion: ctx.kbVersionNumber,
    action: 'handoff',
    traceId: ctx.traceId,
    priceSnapshot: [],
  };
}
