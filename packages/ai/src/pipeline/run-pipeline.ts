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
  type PriceSource,
  type RuleFilterReason,
  ruleFilter,
  unsafeMarkMasked,
} from '@flow/shared';
import { type ExtractResult, primaryLabel } from '../classify/extract-result';
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
import { evaluateTurnRisks, type TurnRiskInput, type TurnRisks } from '../decide/turn-risks';
import type { DraftSource, DraftVoice } from '../draft/draft-prompt';
import type { DraftLang, DraftResult } from '../draft/draft-result';
import { DEFAULT_MIN_RELEVANCE, type Drafter } from '../draft/drafter';
import { checkGuardMoney, type GuardViolation } from '../guard-money';
import { checkReplyGuard, type ReplyGuardViolation } from '../guard-reply';
import { type AbbreviationDict, normalizeAndDetectLang } from '../normalize/normalize-lang';
import type { Rewriter } from '../rewrite/rewriter';
import { executeRoute } from '../route/execute-route';
import { type RouteKind, type RouteReason, routeQuery } from '../route/route';
import { classifyAsk } from '../route/route-topics';
import { type AutoSendPreview, decideAutoSendPreview } from '../try/auto-send-preview';
import type { DraftVoicesByLang } from '../try/brand-voice';

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
  /**
   * Sản phẩm CHƯA CÓ GIÁ (vd. cửa hàng Shopify dùng tiền tệ khác VND — không quy đổi, nguyên tắc #4): nguồn này KHÔNG được
   * tính là trả lời câu hỏi giá (vẫn trả lời được tồn kho/size…). Thiếu = có giá.
   */
  priceUnknown?: boolean;
  /** Nguồn này nêu giá theo tiền tệ GỐC khác VND (Q-SFP1): câu dùng nó không được tự gửi (kiểm giá lúc gửi chưa hỗ trợ). */
  foreignPrice?: boolean;
  /** Dữ liệu giá/tồn CÓ CẤU TRÚC của nguồn sản phẩm (cho `drafts.price_snapshot`, FR-111); chỉ nguồn kind `product`. */
  priceSources?: PriceSource[];
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
  /**
   * Giọng văn THẬT của workspace theo ngôn ngữ (`draftVoicesFromRows`). Ngôn ngữ nhận ra có giọng → dùng giọng đó;
   * thiếu → quay về `voice` (mặc định). Không truyền = luôn `voice`.
   */
  voices?: DraftVoicesByLang;
  /** Cho biết kết quả "nếu Owner bật tự gửi". */
  autoSendEnabled: boolean;
  /**
   * Từ điển viết tắt (hệ thống + workspace, `loadAbbreviationEntries`) để mở "bn"→"bao nhiêu", "sz"→"size" trước khi
   * extract/tìm kiếm. Thiếu → không mở viết tắt (nơi gọi chịu trách nhiệm nạp).
   */
  dict?: AbbreviationDict;
  /** Số cách diễn đạt KHÁC của câu soạn (0–4); thiếu = mặc định của prompt. Xem `DraftInput.variantCount`. */
  variantCount?: number;
  /**
   * Ngữ cảnh chuỗi hội thoại do nơi gọi đọc từ DB (worker): số lần đã hỏi lại, số lần khách hỏi lại cùng ý, và có nhân viên đang
   * giữ chuỗi không (FR-144/147/154). Thiếu = 0/0/không (ô Thử AI không có chuỗi).
   */
  thread?: PipelineThread;
  /** Dữ liệu cho các luật rủi ro cần bài/Page/sản phẩm (mạo danh, giá lệch caption, tồn cũ). Thiếu = các cờ đó tắt. */
  risks?: PipelineRiskInputs;
  /** Loại tệp đính kèm của bình luận (`photo`, `video`, `sticker`…) cho luật ảnh/video (FR-143). Thiếu = không có. */
  attachmentTypes?: readonly string[];
};

/** Ngữ cảnh chuỗi (xem `TryInput.thread`). */
export type PipelineThread = { clarifyCount: number; repeatCount: number; humanHolding?: boolean };

/** Phần của `evaluateTurnRisks` mà nơi gọi phải cấp (bình luận + nguồn do pipeline tự có). */
export type PipelineRiskInputs = Pick<
  TurnRiskInput,
  'impersonation' | 'priceConflict' | 'stockStale'
>;

/**
 * Cổng chặn chạy SAU lọc quy tắc + che PII + chuẩn hóa/nhận ngôn ngữ và TRƯỚC mọi lời gọi LLM (`extract`…): worker dùng nó cho
 * dừng khẩn cấp và hạn mức (FR-090) để bị chặn thì không tốn token. Bị chặn → kết quả `blocked` kèm lý do. Lỗi trong cổng do nơi gọi
 * xử lý theo kiểu đóng (trả `allow: false`), không "mở khi lỗi".
 */
export type PipelineGate = (context: {
  maskedText: string;
  lang: DraftLang | 'other';
}) => Promise<{ allow: true } | { allow: false; reason: string }>;

export type TryDeps = {
  extractor: Extractor;
  drafter: Drafter;
  knowledge: TryKnowledge;
  /** Bước `rewriteQuery` (docs/09 §4, FR-137): viết lại câu hỏi ngắn/mơ hồ thành câu tìm kiếm; thiếu = tìm bằng câu đã chuẩn hóa. */
  rewriter?: Rewriter;
  /** Cổng chặn trước khi gọi LLM (xem `PipelineGate`); thiếu = luôn cho qua (ô Thử AI). */
  gate?: PipelineGate;
};

export type TryResult =
  | { status: 'skipped'; billed: false; reason: RuleFilterReason }
  | {
      status: 'blocked';
      billed: false;
      /** Lý do do cổng trả (vd. `quota_exhausted`, `emergency_stop`). */
      reason: string;
      maskedText: string;
      lang: DraftLang | 'other';
    }
  | {
      status: 'done';
      billed: false;
      maskedText: string;
      /** Văn bản ĐÃ che PII rồi chuẩn hóa (viết tắt, không dấu) — lưu `comments.text_normalized`. */
      normalizedText: string;
      /** Object thô của bước `extract` (để bước ghi lưu `drafts.extracted`). */
      extract: ExtractResult;
      /** Ngữ cảnh chuỗi đã dùng để quyết định (mặc định 0/0/không). */
      thread: Required<PipelineThread>;
      /** Câu dùng để tìm kiếm (sau chuẩn hóa và, nếu bật, sau `rewriteQuery`). */
      searchQuery?: string;
      /** Nguồn câu tìm kiếm khi có bước rewrite (`rule` = không tốn LLM, `llm`); `null` = không chạy rewrite. */
      rewriteSource?: 'rule' | 'llm' | null;
      lang: DraftLang | 'other';
      label: CommentLabel;
      labels: ReadonlyArray<{ label: CommentLabel }>;
      route: RouteKind;
      routeReason: RouteReason;
      decision: ActionDecision;
      /** Lý do các cờ rủi ro đang bật (pháp lý/chèn lệnh/mạo danh) — để chẩn đoán và hiển thị. */
      riskReasons: TurnRisks['reasons'];
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

/** Chủ đề từng ý hỏi, kèm cờ "đây là hỏi giá" (để biết nguồn chưa có giá có trả lời được ý đó không). */
function askTopicsOf(
  asks: readonly string[],
  label: CommentLabel,
): Array<{ topic: KbGapTopic; isPrice: boolean }> {
  const found = asks.map((ask) => ({ topic: topicOf(ask), isPrice: classifyAsk(ask) === 'price' }));
  if (found.length === 0 && label === 'price') return [{ topic: 'product_info', isPrice: true }];
  return found;
}

export async function runPipeline(input: TryInput, deps: TryDeps): Promise<TryResult> {
  const text = input.text.slice(0, TRY_MAX_CHARS);
  const filtered = ruleFilter({ text });
  if (filtered.skip) return { status: 'skipped', billed: false, reason: filtered.reason };

  const masked = maskPii(text);
  const normalized = normalizeAndDetectLang({ text: masked, dict: input.dict });
  const lang: DraftLang | 'other' = normalized.lang;

  // extract và tìm kiếm nhận văn bản ĐÃ chuẩn hóa (viết tắt "bn"→"bao nhiêu", "sz"→"size"…) SAU KHI che PII
  // (docs/09 §4); câu soạn trả lời vẫn dựa trên bản đã che gốc để giữ giọng khách.
  const forModel = unsafeMarkMasked(normalized.normalized);
  // Cổng chặn (dừng khẩn cấp, hạn mức…) TRƯỚC mọi lời gọi LLM: bị chặn thì không tốn token.
  if (deps.gate) {
    const verdict = await deps.gate({ maskedText: masked, lang });
    if (!verdict.allow) {
      return { status: 'blocked', billed: false, reason: verdict.reason, maskedText: masked, lang };
    }
  }
  const extract = await deps.extractor.extract({ workspaceId: input.workspaceId, text: forModel });
  const label = primaryLabel(extract);
  const products = await deps.knowledge.matchProducts(extract.product_mentions);
  // `rewriteQuery` chạy SAU extract (cần biết đã nhận được sản phẩm chưa): chỉ tốn LLM khi câu ngắn/mơ hồ và chưa có sản phẩm.
  const rewritten = deps.rewriter
    ? await deps.rewriter.rewrite({
        workspaceId: input.workspaceId,
        comment: forModel,
        productKnown: products.names.length > 0,
      })
    : null;
  const searchQuery = rewritten ? rewritten.searchQuery : forModel;
  const routed = routeQuery({ extract, resolvedProductIds: products.ids });

  const outcome = await executeRoute(routed.route, {
    sql: () => deps.knowledge.lookupProductFacts(products.ids),
    hybrid: () =>
      deps.knowledge.searchKb(searchQuery, {
        lang: lang === 'other' ? 'vi' : lang,
        productIds: products.ids,
      }),
  });
  const found = [...(outcome.sql ?? []), ...(outcome.hybrid ?? [])].sort(
    (a, b) => b.score - a.score,
  );

  const usable = found.filter((c) => c.score >= DEFAULT_MIN_RELEVANCE);
  // Cờ rủi ro do lõi dùng chung tính (pháp lý FR-160, chèn lệnh); giá lệch caption/tồn cũ/mạo danh cần dữ liệu bài/Page nên
  // ô Thử AI (không có bài, không có Page) để tắt — worker thật sẽ truyền vào cùng hàm này.
  const turnRisks = evaluateTurnRisks({
    text: masked,
    sources: usable.map((c) => ({ id: c.id, text: c.text })),
    ...(input.risks ?? {}),
  });
  const thread = {
    clarifyCount: input.thread?.clarifyCount ?? 0,
    repeatCount: input.thread?.repeatCount ?? 0,
    humanHolding: input.thread?.humanHolding ?? false,
  };
  const decision = decideAction({
    lang,
    extract,
    products: {
      candidates: products.names,
      missingAxes: products.missingAxes,
      mentionedCount: extract.product_mentions.length,
    },
    topics: askTopicsOf(extract.asks, label).map(({ topic, isPrice }) => ({
      topic,
      // Hỏi giá mà sản phẩm chưa có giá → coi như CHƯA có nguồn (→ chuyển hướng), không để AI nói "chưa có giá" như một câu trả lời.
      sourced: usable.some((c) => c.topics.includes(topic) && !(isPrice && c.priceUnknown)),
    })),
    thread: { clarifyCount: thread.clarifyCount, repeatCount: thread.repeatCount },
    // Văn bản ĐÃ che PII + loại tệp đính kèm cho luật ảnh/video (FR-143).
    comment: { text: masked, attachmentTypes: [...(input.attachmentTypes ?? [])] },
    risks: turnRisks.risks,
  });

  // Giọng văn: của workspace theo ngôn ngữ nhận ra (brand_voice thật); thiếu → giọng mặc định. Bộ soạn và bộ chặn dùng CÙNG giọng.
  const voice = (lang === 'other' ? undefined : input.voices?.[lang]) ?? input.voice;
  const draft = await deps.drafter.draft({
    workspaceId: input.workspaceId,
    question: masked,
    lang: lang === 'other' ? 'vi' : lang,
    kbVersion: input.kbVersion,
    ...(input.variantCount === undefined ? {} : { variantCount: input.variantCount }),
    voice,
    sources: found.map((c) => ({ id: c.id, kind: c.kind, text: c.text, relevance: c.score })),
    decision,
  });

  const usedIds = new Set(draft.sources);
  const used = found.filter((c) => usedIds.has(c.id));
  const guardResult = checkGuardMoney({ reply: draft.reply, sources: used.map((c) => c.text) });
  const replyGuard = checkReplyGuard({
    reply: draft.reply,
    lang: lang === 'other' ? 'vi' : lang,
    voice,
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
    normalizedText: normalized.normalized,
    extract,
    thread,
    searchQuery,
    rewriteSource: rewritten ? rewritten.source : null,
    lang,
    label,
    labels: extract.labels,
    route: routed.route,
    routeReason: routed.reason,
    decision,
    riskReasons: turnRisks.reasons,
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
      foreignPriceUsed: used.some((candidate) => candidate.foreignPrice === true),
    }),
  };
}

/**
 * Tên cũ, cùng MỘT hàm: ô Thử AI gọi như trước (không cổng, không ngữ cảnh chuỗi); worker gọi `runPipeline` với cổng chặn và
 * ngữ cảnh đọc từ DB (PIPE-ORCHESTRATOR). Giữ alias để không đổi các nơi đang import `runTryPipeline`.
 */
export const runTryPipeline = runPipeline;

export type PipelineInput = TryInput;
export type PipelineDeps = TryDeps;
export type PipelineResult = TryResult;
