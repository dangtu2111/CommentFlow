/**
 * Ô Thử AI (FR-059, FR-029, US-034): chạy cả chuỗi xử lý MỘT bình luận mẫu bằng các bước đã có, qua interface
 * tiêm được (LLM thật hay mock do nơi gọi chọn). KHÔNG trừ lượt gói (BR-03): file này không đụng bộ đếm lượt,
 * không ghi bình luận/bản nháp/`ai_usage` thật. Thứ tự (docs/09 §4): che PII → lọc quy tắc → chuẩn hóa + nhận
 * ngôn ngữ → phân loại → định tuyến → tìm nguồn → `decideAction` → soạn → guard + độ tin cậy → xem trước cổng tự gửi.
 */
import {
  type CommentLabel,
  type MaskedText,
  maskPii,
  type RuleFilterReason,
  ruleFilter,
  unsafeMarkMasked,
} from '@flow/shared';
import { primaryLabel } from '../classify/extract-result';
import type { Extractor } from '../classify/extractor';
import { resolveLabelProbability } from '../classify/label-signal';
import { assessDraft } from '../confidence/assess-draft';
import type { ConfidenceResult } from '../confidence/confidence';
import {
  type ActionDecision,
  decideAction,
  type KbGapTopic,
  type VariantAxis,
} from '../decide/decide-action';
import type { DraftSource, DraftVoice } from '../draft/draft-prompt';
import type { DraftLang, DraftResult } from '../draft/draft-result';
import { DEFAULT_MIN_RELEVANCE, type Drafter } from '../draft/drafter';
import { checkGuardMoney, type GuardViolation } from '../guard-money';
import { checkReplyGuard, type ReplyGuardViolation } from '../guard-reply';
import { type AbbreviationDict, normalizeAndDetectLang } from '../normalize/normalize-lang';
import { executeRoute } from '../route/execute-route';
import { type RouteKind, type RouteReason, routeQuery } from '../route/route';
import { classifyAsk } from '../route/route-topics';
import { type AutoSendPreview, decideAutoSendPreview } from './auto-send-preview';

export const TRY_MAX_CHARS = 1000;

/** Một nguồn ứng viên kèm điểm (FR-059). */
export type TryCandidate = {
  id: string;
  kind: DraftSource['kind'];
  title: string;
  /** Nội dung ĐÃ che PII. */
  text: MaskedText;
  /** Điểm liên quan 0..1. */
  score: number;
  /** Chủ đề mà nguồn này trả lời được (để biết ý hỏi nào đã có nguồn). */
  topics: KbGapTopic[];
};

/** Ngữ cảnh lọc khi tìm kiến thức. */
export type TrySearchContext = { lang: 'vi' | 'en'; productIds: string[] };

/** Cổng kiến thức của ô Thử AI: bản mock (`createDemoKnowledge`) hoặc, sau này, bản nối KB/DB thật. */
export interface TryKnowledge {
  matchProducts(
    mentions: readonly string[],
  ): Promise<{ ids: string[]; names: string[]; missingAxes: VariantAxis[] }>;
  /** Nhánh `sql`: giá/tồn đọc từ bảng sản phẩm (không vector). */
  lookupProductFacts(ids: readonly string[]): Promise<TryCandidate[]>;
  /** Nhánh `hybrid`: tìm kiến thức (đã biết ngôn ngữ + sản phẩm của bài để lọc, FR-057). */
  searchKb(query: string, context: TrySearchContext): Promise<TryCandidate[]>;
}

export type TryInput = {
  workspaceId: string;
  /** Bình luận mẫu do người dùng gõ (CHƯA che). */
  text: string;
  kbVersion: string;
  voice: DraftVoice;
  /** Cho biết kết quả "nếu Owner bật tự gửi". */
  autoSendEnabled: boolean;
  /**
   * Từ điển viết tắt (hệ thống + workspace, `loadAbbreviationEntries`) để mở "bn"→"bao nhiêu", "sz"→"size" trước khi
   * extract/tìm kiếm. Thiếu → không mở viết tắt (nơi gọi chịu trách nhiệm nạp).
   */
  dict?: AbbreviationDict;
};

export type TryDeps = { extractor: Extractor; drafter: Drafter; knowledge: TryKnowledge };

export type TryResult =
  | { status: 'skipped'; billed: false; reason: RuleFilterReason }
  | {
      status: 'done';
      billed: false;
      maskedText: string;
      lang: DraftLang | 'other';
      label: CommentLabel;
      labels: ReadonlyArray<{ label: CommentLabel }>;
      route: RouteKind;
      routeReason: RouteReason;
      decision: ActionDecision;
      reply: string;
      variants: string[];
      draft: DraftResult;
      /** Mọi nguồn ứng viên theo điểm giảm dần; `used` = nằm trong `draft.sources`. */
      candidates: Array<TryCandidate & { used: boolean }>;
      confidence: ConfidenceResult;
      guard: {
        ok: boolean;
        violations: GuardViolation[];
        /** Vi phạm về nguồn của từng ý, ngôn ngữ, độ dài, xưng hô (docs/09 §4). */
        replyViolations: ReplyGuardViolation[];
      };
      autoSend: AutoSendPreview;
    };

/** Chủ đề của một câu/đoạn chữ (dùng cho ý hỏi và cho đoạn kiến thức tìm được). */
export function topicOf(ask: string): KbGapTopic {
  const kind = classifyAsk(ask);
  if (kind === 'size') return 'size';
  if (kind !== 'other') return 'product_info';
  const text = ask.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  if (/ship|giao|van chuyen|delivery|shipping/.test(text)) return 'shipping';
  if (/giam|khuyen mai|voucher|discount|coupon/.test(text)) return 'discount';
  if (/doi|tra hang|hoan|bao hanh|return|refund|warranty/.test(text)) return 'policy';
  if (/don hang|order/.test(text)) return 'order_status';
  return 'other';
}

function topicsOf(asks: readonly string[], label: CommentLabel): KbGapTopic[] {
  const found = asks.map(topicOf);
  if (found.length === 0 && label === 'price') return ['product_info'];
  return found;
}

export async function runTryPipeline(input: TryInput, deps: TryDeps): Promise<TryResult> {
  const text = input.text.slice(0, TRY_MAX_CHARS);
  const filtered = ruleFilter({ text });
  if (filtered.skip) return { status: 'skipped', billed: false, reason: filtered.reason };

  const masked = maskPii(text);
  const normalized = normalizeAndDetectLang({ text: masked, dict: input.dict });
  const lang: DraftLang | 'other' = normalized.lang;

  // extract và tìm kiếm nhận văn bản ĐÃ chuẩn hóa (viết tắt "bn"→"bao nhiêu", "sz"→"size"…) SAU KHI che PII
  // (docs/09 §4); câu soạn trả lời vẫn dựa trên bản đã che gốc để giữ giọng khách.
  const forModel = unsafeMarkMasked(normalized.normalized);
  const extract = await deps.extractor.extract({ workspaceId: input.workspaceId, text: forModel });
  const label = primaryLabel(extract);
  const products = await deps.knowledge.matchProducts(extract.product_mentions);
  const routed = routeQuery({ extract, resolvedProductIds: products.ids });

  const outcome = await executeRoute(routed.route, {
    sql: () => deps.knowledge.lookupProductFacts(products.ids),
    hybrid: () =>
      deps.knowledge.searchKb(forModel, {
        lang: lang === 'other' ? 'vi' : lang,
        productIds: products.ids,
      }),
  });
  const found = [...(outcome.sql ?? []), ...(outcome.hybrid ?? [])].sort(
    (a, b) => b.score - a.score,
  );

  const usable = found.filter((c) => c.score >= DEFAULT_MIN_RELEVANCE);
  const decision = decideAction({
    lang,
    extract,
    products: { candidates: products.names, missingAxes: products.missingAxes },
    topics: topicsOf(extract.asks, label).map((topic) => ({
      topic,
      sourced: usable.some((c) => c.topics.includes(topic)),
    })),
    thread: { clarifyCount: 0, repeatCount: 0 },
    risks: { priceConflict: false, legalUnsourced: false, impersonation: false, stockStale: false },
  });

  const draft = await deps.drafter.draft({
    workspaceId: input.workspaceId,
    question: masked,
    lang: lang === 'other' ? 'vi' : lang,
    kbVersion: input.kbVersion,
    voice: input.voice,
    sources: found.map((c) => ({ id: c.id, kind: c.kind, text: c.text, relevance: c.score })),
    decision,
  });

  const usedIds = new Set(draft.sources);
  const used = found.filter((c) => usedIds.has(c.id));
  const guardResult = checkGuardMoney({ reply: draft.reply, sources: used.map((c) => c.text) });
  const replyGuard = checkReplyGuard({
    reply: draft.reply,
    lang: lang === 'other' ? 'vi' : lang,
    voice: input.voice,
    claims: draft.claims,
    allowedSourceIds: new Set(
      found.filter((c) => c.score >= DEFAULT_MIN_RELEVANCE).map((c) => c.id),
    ),
  });
  const confidence = assessDraft({
    outcome: { ok: true, draft },
    signals: {
      // `p_label` từ ml → logprob → tự nhất quán, KHÔNG từ số model tự ghi (docs/09 §6.0).
      pLabel: resolveLabelProbability(extract.labelSignal).pLabel,
      sProduct: products.names.length === 1 ? 1 : products.names.length > 1 ? 0.5 : 0,
      sRetrievalTop1: found[0]?.score ?? null,
      sRetrievalTop2: found[1]?.score ?? null,
      action: decision.action,
      askedBefore: decision.askedBefore,
    },
    allowedSourceIds: new Set(
      found.filter((c) => c.score >= DEFAULT_MIN_RELEVANCE).map((c) => c.id),
    ),
  });

  return {
    status: 'done',
    billed: false,
    maskedText: masked,
    lang,
    label,
    labels: extract.labels,
    route: routed.route,
    routeReason: routed.reason,
    decision,
    reply: draft.reply,
    variants: draft.variants ?? [],
    draft,
    candidates: found.map((c) => ({ ...c, used: usedIds.has(c.id) })),
    confidence,
    guard: {
      ok: guardResult.ok && replyGuard.ok,
      violations: guardResult.violations,
      replyViolations: replyGuard.violations,
    },
    autoSend: decideAutoSendPreview({
      autoSendEnabled: input.autoSendEnabled,
      decision,
      draft,
      confidence,
      guardOk: guardResult.ok && replyGuard.ok,
    }),
  };
}
