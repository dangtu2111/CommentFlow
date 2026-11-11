/**
 * Ô Thử AI (FR-059, FR-029, US-034): chạy cả chuỗi xử lý MỘT bình luận mẫu bằng các bước đã có, qua interface
 * tiêm được (LLM thật hay mock do nơi gọi chọn). KHÔNG trừ lượt gói (BR-03): file này không đụng bộ đếm lượt,
 * không ghi bình luận/bản nháp/`ai_usage` thật. Thứ tự (docs/09 §4): che PII → lọc quy tắc → chuẩn hóa + nhận
 * ngôn ngữ → phân loại → định tuyến → tìm nguồn → `decideAction` → soạn → guard + độ tin cậy → xem trước cổng tự gửi.
 */
import {
  type CommentLabel,
  type KbTopic,
  type MaskedText,
  maskPii,
  normalizeAttrs,
  normalizeSearchText,
  type PriceSource,
  type RuleFilterReason,
  ruleFilter,
  unsafeMarkMasked,
} from '@flow/shared';
import { type ExtractResult, extractResultSchema, primaryLabel } from '../classify/extract-result';
import type { ExtractOutcome, Extractor } from '../classify/extractor';

import { resolveLabelProbability } from '../classify/label-signal';
import { assessDraft } from '../confidence/assess-draft';
import type { ConfidenceResult } from '../confidence/confidence';
import {
  type ActionDecision,
  decideAction,
  handoffDecision,
  type KbGapTopic,
  regionClarifyDecision,
  type VariantAxis,
} from '../decide/decide-action';
import { evaluateTurnRisks, type TurnRiskInput, type TurnRisks } from '../decide/turn-risks';
import { type DraftSource, type DraftVoice, describeAddress } from '../draft/draft-prompt';
import type { DraftLang, DraftResult } from '../draft/draft-result';
import { DEFAULT_MIN_RELEVANCE, type Drafter } from '../draft/drafter';
import {
  buildFactPlan,
  checkSlotText as checkSlots,
  type FactPlan,
  type FactTopic,
  fallbackTemplate,
  fillSlots,
  findProvinces,
  inviteUnknownText,
  type PlanProduct,
  type PolicyFacts,
  requiredFactIds,
  resolvePlace,
  type StockMode,
  slotIds,
} from '../fact-plan';
import { checkGuardMoney, type GuardViolation } from '../guard-money';
import { checkReplyGuard, type ReplyGuardViolation } from '../guard-reply';
import { checkConceptSupport, unsupportedConceptReply } from '../guard-support';
import { classifyTopic } from '../kb-sync/topic';
import { type AbbreviationDict, normalizeAndDetectLang } from '../normalize/normalize-lang';
import type { PromptHistory } from '../prompt-history';
import type { CustomerContext } from '../rewrite/customer-context';
import type { Rewriter } from '../rewrite/rewriter';
import { executeRoute } from '../route/execute-route';
import { type RouteKind, type RouteReason, routeQuery } from '../route/route';
import { classifyAsk } from '../route/route-topics';
import { type AutoSendPreview, decideAutoSendPreview } from '../try/auto-send-preview';
import type { DraftVoicesByLang } from '../try/brand-voice';
import { inferAttrsFromText } from './attr-from-text';
import { type ConversationState, carryOverAsks, nextConversationState } from './conversation-state';
import { evaluateReplyCap, replyCapClosingDecision } from './reply-cap';

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
  /** Đoạn kiến thức này thuộc nhóm chính sách MÂU THUẪN (cờ `kb_chunks.metadata.conflict_group`): chủ đề của nhóm (vd `shipping_time`). */
  conflictTopic?: KbTopic;
  /** Dữ liệu giá/tồn CÓ CẤU TRÚC của nguồn sản phẩm (cho `drafts.price_snapshot`, FR-111); chỉ nguồn kind `product`. */
  priceSources?: PriceSource[];
};

/** Ngữ cảnh lọc khi tìm kiến thức. */
export type TrySearchContext = { lang: 'vi' | 'en'; productIds: string[] };

/** Cổng kiến thức của ô Thử AI: bản mock (`createDemoKnowledge`) hoặc, sau này, bản nối KB/DB thật. */
export type TryProductMatch = {
  ids: string[];
  names: string[];
  missingAxes: VariantAxis[];
};

export interface TryKnowledge {
  matchProducts(mentions: readonly string[]): Promise<TryProductMatch>;
  /**
   * Nhận sản phẩm theo id khi khách KHÔNG nêu tên (Q-POR12): sản phẩm ở lượt trước hoặc sản phẩm gắn bài (docs/10 §5.1). Thiếu = không
   * có đường dự phòng này (ô Thử AI mẫu).
   */
  resolveProducts?(ids: readonly string[]): Promise<TryProductMatch>;
  /**
   * Dữ liệu sản phẩm CÓ CẤU TRÚC cho fact plan (ADR 017, cờ `factSlots`). Thiếu → không lập được sự kiện sản phẩm (cờ bật mà thiếu hàm này → không có sự kiện, chỉ mời ib).
   * `stockStale`: tồn đã quá hạn (FR-151) → sự kiện tồn là `unknown`.
   */
  lookupPlanProducts?(
    ids: readonly string[],
    options?: { stockStale?: boolean },
  ): Promise<PlanProduct[]>;
  /** Tên các sản phẩm đang bán (đã nạp sẵn); dùng để khớp tên không dấu bằng code khi `extract` không trả tên nào. Thiếu → bỏ bước này. */
  productNames?: readonly string[];
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
  /** `channels.reply_language` / mặc định của workspace khi câu khách quá ngắn để nhận ngôn ngữ (vd. "still available?"). */
  replyLanguage?: 'vi' | 'en' | null;
  /** Ngôn ngữ của lượt khách trước trong cùng luồng (ưu tiên hơn `replyLanguage` khi câu ngắn). */
  previousLang?: 'vi' | 'en' | null;
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
  /** Trần trả lời của (khách, bài) trong 24 giờ (FR-167): `count` = câu AI đã có (không tính bình luận này), `max` = ngưỡng 1–5. */
  replyCap?: { count: number; max: number };
  /** Ngữ cảnh hội thoại ĐÃ che PII (PIPE-CONVO-CONTEXT, Q-POR12): lượt trước, bình luận cha, caption, sản phẩm gắn bài, trạng thái. */
  convo?: PipelineConvoInput;
  /**
   * DRAFT-FACT-SLOTS (ADR 017): BẬT chế độ chỗ giữ chỗ cho workspace này (cờ theo workspace, mặc định TẮT = không truyền). `policy` = chính sách có cấu trúc ĐÃ DUYỆT
   * (giá trị `draft` chưa duyệt không được đưa vào), `stock` = tùy chọn nêu tồn của Owner. Có → code lập fact plan, LLM chỉ viết lời với `{fact:id}`, code điền giá trị.
   */
  factSlots?: { policy: PolicyFacts; stock: StockMode };
  /**
   * BẬT chế độ chỗ giữ chỗ (cờ `cf.ai.fact_slots`, mặc định TẮT). `factSlots` (thẻ chính sách + tồn) luôn được nạp để code lập fact plan; plan phục vụ (a) nhận ra câu hỏi đổi trả thường không bị nhãn phụ
   * complaint ép chuyển người và (b) câu dự phòng do code dựng khi bản nháp rỗng/không dùng được — cả khi cờ TẮT. Chỉ khi cờ BẬT, LLM mới viết với `{fact:id}` và các hành vi dựa trên plan khác (handoff/hỏi khu vực/guard chỗ giữ chỗ) mới chạy.
   */
  factSlotsMode?: boolean;
};

export type PipelineConvoInput = {
  context: CustomerContext;
  parentComment?: MaskedText;
  postCaption?: MaskedText;
  /** Sản phẩm gắn bài ĐÃ xác nhận (id + tên; chính trước): ứng viên ưu tiên khi khách không nêu tên. */
  postProductIds: readonly string[];
  postProductNames: readonly string[];
  /** Trạng thái có cấu trúc của lượt trước trong chuỗi (sản phẩm đã nhận, ý đang chờ). */
  state: ConversationState | null;
};

/** Lịch sử cho prompt (extract/soạn): chỉ văn bản đã che PII. */
function historyOf(convo: PipelineConvoInput | undefined): PromptHistory | undefined {
  if (!convo) return undefined;
  const { context } = convo;
  return {
    turns: context.turns.map((t) => ({ from: t.from, text: t.text })),
    otherQuestions: context.otherQuestions.map((q) => q.text),
    ...(convo.parentComment ? { parentComment: convo.parentComment } : {}),
    ...(convo.postCaption ? { postCaption: convo.postCaption } : {}),
  };
}

/** Kết quả `extract` rỗng cho câu CHỐT (không gọi LLM): nhãn trung tính, không sản phẩm, không ý hỏi. */
const EMPTY_EXTRACT: ExtractOutcome = extractResultSchema.parse({
  labels: [{ label: 'other' }],
  product_mentions: [],
  refers_to_image: false,
  size: null,
  color: null,
  height_cm: null,
  weight_kg: null,
  qty: null,
  cited_price_vnd: null,
  order_intent: null,
  asks: [],
  topics: [],
  destination: null,
});

/** Ngữ cảnh chuỗi (xem `TryInput.thread`). */
export type PipelineThread = {
  clarifyCount: number;
  repeatCount: number;
  humanHolding?: boolean;
};

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
      /** Sản phẩm đã nhận ra ở lượt này (id) — để ghi trạng thái hội thoại và `retrieval_logs`. */
      resolvedProductIds: string[];
      /** Trạng thái có cấu trúc cho lượt SAU (ghi vào `drafts.context_refs`, Q-POR12). */
      conversationState: ConversationState;
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
      riskReasons: TurnRisks['reasons'] & { review?: string[] };
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
      /** Fact plan của lượt (chỉ khi bật `factSlots`) — để chẩn đoán/EVAL/giao diện. */
      factPlan?: FactPlan | null;
      /** Chẩn đoán đường fact plan (EVAL): số câu LLM bị guard chỗ giữ chỗ TỪ CHỐI CỨNG / tổng, và câu được chọn. */
      slotDiagnostics?: SlotDiagnostics;
      /** KB-GAPS-FROM-HANDOFF: chủ đề lỗ hổng từ plan (`plan` = sự kiện chưa có, cả cờ tắt) và chủ đề của lượt phải dùng câu dự phòng/chuyển người (`fallback`). */
      gapTopics?: { plan: KbGapTopic[]; fallback: KbGapTopic[] };
      /** Dấu vết guard CHỈ ĐỂ QUAN SÁT (EVAL/chẩn đoán lỗi oan vs thật): không ảnh hưởng quyết định. */
      guardTrace?: GuardTrace;
    };

/**
 * Dấu vết bước guard khái niệm (GUARD-SEMANTIC-SUPPORT): bản nháp gốc bị loại vì khẳng định khái niệm mà nguồn ĐÃ DÙNG không nêu — ghi khái niệm bị bắt, câu gốc và các nguồn đã dùng để sau này
 * kiểm khái niệm đó có nằm ở đoạn nào khác trong `candidates` không (lỗi oan do nguồn khai thiếu). Chỉ quan sát, không đổi hành vi.
 */
export type GuardTrace = {
  concept?: { concepts: string[]; draftReply: string; usedIds: string[] };
};

/** Chủ đề của một câu/đoạn chữ (dùng cho ý hỏi và cho đoạn kiến thức tìm được). */
export function topicOf(ask: string): KbGapTopic {
  const kind = classifyAsk(ask);
  if (kind === 'size') return 'size';
  if (kind !== 'other') return 'product_info';
  const text = ask.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  if (/ship|giao|van chuyen|delivery|shipping/.test(text)) return 'shipping';
  if (/giam|khuyen mai|voucher|discount|coupon/.test(text)) return 'discount';
  const policy = /doi|tra hang|hoan|bao hanh|return|refund|warranty/.test(text);
  // Q-EV2-3: hỏi THỜI GIAN giao/xử lý ("bao lâu nhận được hàng", "how long until I get my order") là chính sách giao hàng, KHÔNG phải tra cứu
  // trạng thái đơn. Chỉ khi có cả từ chỉ thời gian VÀ đối tượng giao nhận, và không dính chủ đề đổi trả/bảo hành/hoàn tiền.
  if (
    !policy &&
    /how long|how many days|how soon|when (will|would|do|can)|bao lau|may ngay|khi nao|bao gio|mat bao|thoi gian/.test(
      text,
    ) &&
    /order|deliver|arriv|receiv|nhan|hang|don\b/.test(text)
  ) {
    return 'shipping';
  }
  if (policy) return 'policy';
  // Tra cứu trạng thái đơn: "đơn đến đâu rồi", "where is my order", "track".
  if (/don hang|order|den dau|track/.test(text)) return 'order_status';
  return 'other';
}

/**
 * Chủ đề MỊN (mã `KbTopic`) của một ý hỏi để so với nhóm mâu thuẫn: từ khóa mịn trước (phí ship/giao hàng/hoàn tiền…); không khớp thì suy từ chủ đề thô
 * (`topicOf`): hỏi giao hàng chung → thời gian giao; hỏi chính sách chung → đổi trả/hoàn tiền/bảo hành.
 */
function conflictTopicsOfAsk(ask: string): KbTopic[] {
  const fine = classifyTopic(ask, 'other');
  if (fine !== 'other') return [fine];
  const coarse = topicOf(ask);
  if (coarse === 'shipping') return ['shipping_time'];
  if (coarse === 'policy') return ['return', 'refund', 'warranty'];
  return [];
}

/** Chủ đề từng ý hỏi, kèm cờ "đây là hỏi giá" (để biết nguồn chưa có giá có trả lời được ý đó không). */
function askTopicsOf(
  asks: readonly string[],
  label: CommentLabel,
): Array<{ topic: KbGapTopic; isPrice: boolean }> {
  const found = asks.map((ask) => ({
    topic: topicOf(ask),
    isPrice: classifyAsk(ask) === 'price',
  }));
  if (found.length === 0 && label === 'price') return [{ topic: 'product_info', isPrice: true }];
  return found;
}

/**
 * Chế độ chỗ giữ chỗ: chủ đề gửi `decideAction` lấy từ chủ đề `extract` trả (enum) cho nhóm giá/tồn/ship/chính sách — KHÔNG từ regex trên câu ("return shipping" không còn bị coi là ship).
 * Ý hỏi khác (size, khuyến mãi, đơn hàng…) giữ cách cũ.
 */
function slotAskTopics(
  regexTopics: Array<{ topic: KbGapTopic; isPrice: boolean }>,
  factTopics: readonly FactTopic[],
): Array<{ topic: KbGapTopic; isPrice: boolean }> {
  if (factTopics.length === 0) return regexTopics;
  const productFactAsked = factTopics.some((t) => t === 'price' || t === 'stock');
  const kept = regexTopics.filter(
    ({ topic }) =>
      topic !== 'shipping' && topic !== 'policy' && !(topic === 'product_info' && productFactAsked),
  );
  const fromPlan = factTopics.map((t) => ({
    topic: GAP_TOPIC_OF_FACT[t],
    isPrice: t === 'price',
  }));
  const seen = new Set<string>();
  return [...kept, ...fromPlan].filter(({ topic, isPrice }) => {
    const key = `${topic}|${isPrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Tên sản phẩm đưa vào `decideAction` (và gợi ý lựa chọn khi hỏi lại): schema chỉ nhận ≤ 120 ký tự, mà tên sản phẩm từ Shopify/Haravan
 * thường dài hơn (tiêu đề SEO 150–255 ký tự). Tên quá dài KHÔNG được làm cả đầu vào "không đọc được" (→ chuyển người oan mọi câu hỏi về
 * sản phẩm đó): cắt gọn ở đây, có dấu "…". Tên đầy đủ vẫn nằm trong nguồn sản phẩm (câu nguồn) để soạn câu.
 */
export const MAX_DECISION_PRODUCT_NAME = 120;
export function shortProductName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.length <= MAX_DECISION_PRODUCT_NAME
    ? clean
    : `${clean.slice(0, MAX_DECISION_PRODUCT_NAME - 1).trimEnd()}…`;
}

/**
 * Khách (hoặc câu viết lại) nhắc ĐÚNG tên một sản phẩm trong danh mục nhưng `extract` không trả tên: khớp bằng code, bỏ dấu, theo ranh giới từ, KHÔNG đồng nghĩa, không LLM.
 * Chỉ nhận khi đúng MỘT tên khớp (nhiều tên → không chọn, tránh gán nhầm).
 */
function uniqueNameInTexts(names: readonly string[], texts: readonly string[]): string | null {
  const haystacks = texts.map((text) => ` ${normalizeSearchText(text)} `);
  const hits = [
    ...new Set(
      names.filter((name) => {
        const needle = normalizeSearchText(name);
        return needle !== '' && haystacks.some((text) => text.includes(` ${needle} `));
      }),
    ),
  ];
  return hits.length === 1 ? (hits[0] as string) : null;
}

async function withInferredAttrs<T extends ExtractResult>(
  extract: T,
  products: TryProductMatch,
  deps: TryDeps,
  text: string,
): Promise<T> {
  if (
    products.ids.length !== 1 ||
    (extract.size !== null && extract.color !== null) ||
    !deps.knowledge.lookupPlanProducts
  ) {
    return extract;
  }
  const [product] = await deps.knowledge.lookupPlanProducts(products.ids);
  if (!product) return extract;
  const found = inferAttrsFromText(
    text,
    product.variants,
    { size: extract.size, color: extract.color },
    extract.product_mentions,
  );
  return found.size === extract.size && found.color === extract.color
    ? extract
    : { ...extract, size: found.size, color: found.color };
}

const EMPTY_PRODUCTS: TryProductMatch = { ids: [], names: [], missingAxes: [] };

/**
 * Nhận sản phẩm của lượt: (1) khách nêu tên → so khớp như cũ; (2) KHÔNG nêu tên → sản phẩm lượt trước ("M đen" sau khi shop hỏi size
 * của áo X → áo X), rồi sản phẩm gắn bài (docs/10 §5.1). Khách nêu tên mà không khớp thì KHÔNG dự phòng (tránh gán nhầm sản phẩm bài).
 */
async function resolveProductsFor(
  extract: ExtractResult,
  input: TryInput,
  deps: TryDeps,
  texts: readonly string[],
): Promise<TryProductMatch> {
  let mentions = extract.product_mentions;
  if (mentions.length === 0) {
    const named = uniqueNameInTexts(deps.knowledge.productNames ?? [], texts);
    if (named !== null) mentions = [named];
  }
  const matched = await deps.knowledge.matchProducts(mentions);
  if (matched.ids.length > 0 || mentions.length > 0) return matched;
  const fallbackIds = input.convo?.state?.productIds.length
    ? input.convo.state.productIds
    : (input.convo?.postProductIds ?? []);
  if (fallbackIds.length === 0 || !deps.knowledge.resolveProducts) return matched;
  return deps.knowledge.resolveProducts(fallbackIds);
}

/** Loại sự kiện chính sách đã biết → nhóm pháp lý (FR-160) mà nó làm có nguồn. */
const PLAN_LEGAL_TOPIC: Partial<Record<string, string>> = {
  returns: 'refund',
  refund_to: 'refund',
  return_shipping: 'refund',
  return_eligibility: 'refund',
  warranty: 'warranty',
};

/** Mọi biến thể cùng MỘT giá (đã biết, kể cả giá chung của sản phẩm) → khách không cần chọn biến thể để biết giá. */
function hasUniformVariantPrice(product: PlanProduct): boolean {
  if (product.variants.length === 0) return false;
  const prices = new Set(
    product.variants.map((variant) => variant.priceMinor ?? product.priceMinor),
  );
  return prices.size === 1 && !prices.has(null);
}

const GAP_TOPIC_OF_FACT: Record<FactTopic, KbGapTopic> = {
  price: 'product_info',
  stock: 'product_info',
  ship_fee: 'shipping',
  ship_time: 'shipping',
  cod: 'policy',
  returns: 'policy',
  warranty: 'policy',
  payment: 'policy',
  ship_destination: 'shipping',
  refund_to: 'policy',
  return_shipping: 'policy',
  return_eligibility: 'policy',
  defect: 'policy',
};

/** Chủ đề kiến thức (shipping/policy) đã có đủ sự kiện trong fact plan chưa; `null` = fact plan không phụ trách chủ đề này (giữ cách cũ). */
/** Chủ đề lỗ hổng của lượt chuyển người/dùng câu dự phòng: theo sự kiện plan hỏi → theo ý hỏi (`topicOf`) → 'other'. */
function fallbackGapTopics(
  factTopics: readonly FactTopic[],
  asks: readonly string[],
): KbGapTopic[] {
  const fromFacts = factTopics.map((t) => GAP_TOPIC_OF_FACT[t]);
  const topics = fromFacts.length > 0 ? fromFacts : asks.map((ask) => topicOf(ask));
  return topics.length > 0 ? [...new Set(topics)] : ['other'];
}

function planSourced(plan: FactPlan, factTopics: FactTopic[], topic: KbGapTopic): boolean | null {
  const wanted = factTopics.filter(
    (t) => GAP_TOPIC_OF_FACT[t] === topic && topic !== 'product_info',
  );
  if (wanted.length === 0) return null;
  return !plan.unknownTopics.some((t) => wanted.includes(t));
}

export async function runPipeline(input: TryInput, deps: TryDeps): Promise<TryResult> {
  const text = input.text.slice(0, TRY_MAX_CHARS);
  const filtered = ruleFilter({ text });
  if (filtered.skip) return { status: 'skipped', billed: false, reason: filtered.reason };

  const masked = maskPii(text);
  const normalized = normalizeAndDetectLang({
    text: masked,
    dict: input.dict,
    previousLang: input.previousLang ?? null,
    replyLanguage: input.replyLanguage ?? null,
  });
  const lang: DraftLang | 'other' = normalized.lang;

  // extract và tìm kiếm nhận văn bản ĐÃ chuẩn hóa (viết tắt "bn"→"bao nhiêu", "sz"→"size"…) SAU KHI che PII
  // (docs/09 §4); câu soạn trả lời vẫn dựa trên bản đã che gốc để giữ giọng khách.
  const forModel = unsafeMarkMasked(normalized.normalized);
  // Cổng chặn (dừng khẩn cấp, hạn mức…) TRƯỚC mọi lời gọi LLM: bị chặn thì không tốn token.
  if (deps.gate) {
    const verdict = await deps.gate({ maskedText: masked, lang });
    if (!verdict.allow) {
      return {
        status: 'blocked',
        billed: false,
        reason: verdict.reason,
        maskedText: masked,
        lang,
      };
    }
  }
  // FR-167: câu CHỐT (chạm trần) → không extract/tìm kiếm (không tốn token, không sự kiện): chỉ soạn câu mời nhắn tin theo mẫu shop.
  const closing = input.replyCap !== undefined && evaluateReplyCap(input.replyCap) === 'closing';
  const history = historyOf(input.convo);
  const state = input.convo?.state ?? null;
  const rawExtract = closing
    ? EMPTY_EXTRACT
    : await deps.extractor.extract({
        workspaceId: input.workspaceId,
        text: forModel,
        ...(history ? { history } : {}),
      });
  // Khách trả lời ngắn ("M đen") mà lượt trước còn ý đang chờ → thừa hưởng ý đó (Q-POR12).
  const extractBase = closing ? rawExtract : carryOverAsks(rawExtract, state);
  const label = primaryLabel(extractBase);
  const products = closing
    ? EMPTY_PRODUCTS
    : await resolveProductsFor(extractBase, input, deps, [forModel]);
  // Đã khớp đúng MỘT sản phẩm mà `extract` bỏ sót size/màu (tiếng Việt không dấu): bổ sung bằng so khớp từ-với-giá-trị-biến-thể của CHÍNH sản phẩm đó (code, không LLM, không đồng nghĩa).
  const extract = await withInferredAttrs(extractBase, products, deps, masked);
  // `rewriteQuery` chạy SAU extract (cần biết đã nhận được sản phẩm chưa): chỉ tốn LLM khi câu ngắn/mơ hồ và chưa có sản phẩm.
  const rewritten =
    deps.rewriter && !closing
      ? await deps.rewriter.rewrite({
          workspaceId: input.workspaceId,
          comment: forModel,
          productKnown: products.names.length > 0,
          ...(input.convo
            ? {
                context: input.convo.context,
                ...(input.convo.parentComment ? { parentComment: input.convo.parentComment } : {}),
                ...(input.convo.postCaption ? { postCaption: input.convo.postCaption } : {}),
                ...(input.convo.postProductNames[0]
                  ? {
                      productName: unsafeMarkMasked(input.convo.postProductNames[0]),
                    }
                  : {}),
              }
            : {}),
        })
      : null;
  const searchQuery = rewritten ? rewritten.searchQuery : forModel;
  const routed = routeQuery({ extract, resolvedProductIds: products.ids });

  const outcome = closing
    ? { sql: [], hybrid: [] }
    : await executeRoute(routed.route, {
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
  // DRAFT-FACT-SLOTS: fact plan do CODE lập (0 lần gọi LLM) khi có thẻ chính sách (luôn nạp); `slotMode` (cờ) chỉ quyết định LLM có viết bằng chỗ giữ chỗ không.
  const planMode = input.factSlots !== undefined && !closing;
  const slotMode = planMode && input.factSlotsMode === true;
  // Chủ đề do `extract` trả (enum, Zod) — không đoán bằng từ khóa; mỗi chủ đề chỉ một lần.
  const extractedTopics: FactTopic[] = planMode ? [...new Set(extract.topics)] : [];
  // Hỏi khuyến mãi/giảm giá KHÔNG phải hỏi giá/tồn: khi có ý hỏi được xếp 'discount' mà chưa nhận ra sản phẩm nào → bỏ price/stock (chủ đề vẫn do extract trả; code chỉ lọc theo ý hỏi đã có).
  const discountAsked = extract.asks.some((ask) => topicOf(ask) === 'discount');
  // Khách nhắc một sản phẩm mà danh mục KHÔNG có ("shop có bán giày k"): không thêm chủ đề giá/tồn từ fact plan → giữ đường cũ (chuyển hướng), không hỏi lại "sản phẩm nào".
  const mentionedButUnknown = extract.product_mentions.length > 0 && products.ids.length === 0;
  const factTopics: FactTopic[] =
    (discountAsked || mentionedButUnknown) && products.ids.length === 0
      ? extractedTopics.filter((topic) => topic !== 'price' && topic !== 'stock')
      : extractedTopics;
  // Nơi khách hỏi giao tới → quốc gia (bảng quốc gia/tiểu bang Mỹ + tỉnh/thành VN); không nhận ra → null (không đoán).
  // Quét cả câu (masked) CHỈ khi extract báo chủ đề ship_destination; còn lại dùng đúng `extract.destination` — tránh nhầm tên hàng ("Georgia peach dress", "China blue vase") với địa điểm.
  const destination = planMode
    ? resolvePlace(extract.destination ?? (factTopics.includes('ship_destination') ? masked : ''))
    : null;
  const planProducts: PlanProduct[] =
    planMode && deps.knowledge.lookupPlanProducts
      ? await deps.knowledge.lookupPlanProducts(products.ids, {
          stockStale: turnRisks.risks.stockStale,
        })
      : [];
  const sizeText = extract.size ?? '';
  const planAll: FactPlan | null =
    planMode && input.factSlots
      ? buildFactPlan({
          products: planProducts,
          topics: factTopics,
          destination,
          customerText: [masked, ...extract.asks].join(' '),
          // Chỉ coi là "khách nêu địa điểm" khi câu có tỉnh/thành nhận ra được; không có → null (chưa nêu).
          location: findProvinces(masked).length > 0 ? masked : null,
          // Cùng chuẩn hóa với `attrs_norm` của biến thể (FR-129): khóa mau→color, giá trị đen→black.
          variantAttrs: normalizeAttrs({
            ...(extract.size ? { size: extract.size } : {}),
            ...(extract.color ? { color: extract.color } : {}),
          }),
          // Số KHÁCH nêu đi qua chỗ giữ chỗ customer_measure: kích thước có chữ số (size 29, 1m58) và số lượng đặt (extract.qty). Không whitelist số khác trong câu khách.
          measures: [
            ...(/\d/.test(sizeText) ? [sizeText] : []),
            ...(extract.qty === null ? [] : [String(extract.qty)]),
          ],
          policy: input.factSlots.policy,
          stock: input.factSlots.stock,
        })
      : null;
  // Các hành vi dựa trên plan CHỈ ở chế độ chỗ giữ chỗ; cờ TẮT chỉ dùng `planAll` cho hai việc nêu ở `factSlotsMode`.
  const factPlan: FactPlan | null = slotMode ? planAll : null;
  // FR-160 ở chế độ chỗ giữ chỗ: nhóm pháp lý (hoàn tiền/bảo hành) ĐÃ có nguồn nếu fact plan có sự kiện ĐÃ BIẾT cùng nhóm (nguồn = dòng chính sách đã duyệt `pf:<id>`); chưa biết → vẫn chưa nguồn.
  const planLegalCovered = new Set<string>(
    (factPlan?.facts ?? []).flatMap((fact) =>
      fact.status === 'known' && PLAN_LEGAL_TOPIC[fact.kind]
        ? [PLAN_LEGAL_TOPIC[fact.kind] as string]
        : [],
    ),
  );
  const legalReasons = turnRisks.reasons.legal.filter((topic) => !planLegalCovered.has(topic));
  const legalUnsourced =
    factPlan === null ? turnRisks.risks.legalUnsourced : legalReasons.length > 0;
  // Chính sách mâu thuẫn: chỉ khi đoạn DÙNG ĐƯỢC (qua ngưỡng) thuộc nhóm mâu thuẫn của đúng chủ đề khách hỏi; ý khác trả lời bình thường.
  const askedConflictTopics = new Set(
    (extract.asks.length > 0 ? extract.asks : [masked]).flatMap(conflictTopicsOfAsk),
  );
  const policyConflict = usable.some(
    (c) => c.conflictTopic !== undefined && askedConflictTopics.has(c.conflictTopic),
  );
  // Hỏi CHỈ giá mà mọi biến thể CÙNG giá → trả lời giá, không hỏi size/màu (kiểm TRƯỚC khi hỏi biến thể). Có biến thể khác giá hoặc thiếu giá → vẫn hỏi như cũ.
  let missingAxes = products.missingAxes;
  const asksOnlyPrice = (() => {
    const asked = askTopicsOf(extract.asks, label);
    return asked.length > 0 && asked.every(({ isPrice }) => isPrice);
  })();
  if (
    asksOnlyPrice &&
    missingAxes.length > 0 &&
    products.ids.length > 0 &&
    deps.knowledge.lookupPlanProducts
  ) {
    const candidates =
      planProducts.length > 0
        ? planProducts
        : await deps.knowledge.lookupPlanProducts(products.ids, {
            ...(turnRisks.risks.stockStale ? { stockStale: true } : {}),
          });
    if (candidates.length > 0 && candidates.every(hasUniformVariantPrice)) missingAxes = [];
  }
  // `decideFor(strict)`: strict = coi mọi ý KHÔNG phải hỏi giá là CHƯA có nguồn (dùng khi guard nghĩa loại bản soạn đầu).
  // Hàng lỗi trùng phạm vi bảo hành: nhãn CHÍNH là advice/price, nhãn phụ complaint, và plan đã khớp phạm vi thẻ bảo hành (requiresHumanReview) → không để nhãn phụ ép chuyển người;
  // câu trả lời vẫn bắt buộc người duyệt (không tự gửi). Nhãn chính complaint, hoặc phạm vi không khớp (plan.handoff) → giữ chuyển người.
  // Mở rộng (LABEL-SECONDARY-COMPLAINT): câu hỏi đổi trả THƯỜNG ("mặc không vừa được đổi không") — chủ đề thuộc nhóm đổi trả, KHÔNG phải hàng lỗi (`defect`), plan không chuyển người và đã có sự kiện
  // đổi trả ĐÃ BIẾT — nhãn phụ complaint cũng không ép chuyển người (trả lời từ chính sách đã duyệt, không cần người duyệt thêm).
  const RETURN_KINDS = ['returns', 'refund_to', 'return_shipping', 'return_eligibility'];
  const ordinaryReturnQuestion =
    planAll !== null &&
    planAll.handoff !== true &&
    !factTopics.includes('defect') &&
    planAll.facts.some((fact) => fact.status === 'known' && RETURN_KINDS.includes(fact.kind));
  const waiveSecondaryComplaint =
    (planAll?.requiresHumanReview === true || ordinaryReturnQuestion) &&
    (label === 'advice' || label === 'price') &&
    extract.labels.some((item) => item.label === 'complaint');
  const decideExtract = waiveSecondaryComplaint
    ? {
        ...extract,
        labels: extract.labels.filter((item) => item.label !== 'complaint'),
      }
    : extract;
  const decideFor = (strict: boolean): ActionDecision =>
    decideAction({
      lang,
      extract: decideExtract,
      products: {
        candidates: products.names.map(shortProductName),
        missingAxes,
        mentionedCount: extract.product_mentions.length,
      },
      topics: (factPlan === null
        ? askTopicsOf(extract.asks, label)
        : slotAskTopics(askTopicsOf(extract.asks, label), factTopics)
      ).map(({ topic, isPrice }) => ({
        topic,
        // Hỏi giá mà sản phẩm chưa có giá → coi như CHƯA có nguồn (→ chuyển hướng), không để AI nói "chưa có giá" như một câu trả lời.
        sourced:
          !(strict && !isPrice) &&
          ((factPlan === null ? null : planSourced(factPlan, factTopics, topic)) ??
            usable.some((c) => c.topics.includes(topic) && !(isPrice && c.priceUnknown))),
      })),
      thread: {
        clarifyCount: thread.clarifyCount,
        repeatCount: thread.repeatCount,
      },
      // Văn bản ĐÃ che PII + loại tệp đính kèm cho luật ảnh/video (FR-143).
      comment: {
        text: masked,
        attachmentTypes: [...(input.attachmentTypes ?? [])],
      },
      risks: { ...turnRisks.risks, legalUnsourced, policyConflict },
    });
  let decision = closing ? replyCapClosingDecision() : decideFor(false);
  // Hàng lỗi trùng phạm vi bảo hành: có câu trả lời từ thẻ bảo hành nhưng BẮT BUỘC người duyệt, không bao giờ tự gửi (kể cả khi sau này bật auto-reply).
  if (planAll?.requiresHumanReview && decision.action !== 'handoff') {
    decision = { ...decision, needsHuman: true, autoSendPolicy: 'never' };
  }
  // Phí/thời gian/COD phụ thuộc khu vực mà khách chưa nêu → HỎI tỉnh/thành (FR-147), không chuyển hướng. Rủi ro/handoff vẫn thắng.
  // Chủ đề phải chuyển người (hàng lỗi/sai hàng: chưa có chính sách có cấu trúc) — không mượn số ngày/điều kiện của đổi trả.
  // Cả khi cờ TẮT: hàng lỗi/sai hàng chưa có chính sách có cấu trúc → chuyển người (không mượn số ngày/điều kiện của đổi trả để trả lời).
  if (planAll?.handoff && decision.action !== 'handoff' && !closing) {
    decision = handoffDecision('claim_unsupported', decision.askedBefore);
  } else if (
    factPlan?.clarify &&
    (decision.action === 'answer' || decision.action === 'redirect')
  ) {
    decision = regionClarifyDecision(decision.askedBefore);
  }

  // Giọng văn: của workspace theo ngôn ngữ nhận ra (brand_voice thật); thiếu → giọng mặc định. Bộ soạn và bộ chặn dùng CÙNG giọng.
  const voice = (lang === 'other' ? undefined : input.voices?.[lang]) ?? input.voice;
  // Sự kiện ĐÃ BIẾT của fact plan (mã + loại) đưa cho bộ soạn; null = không dùng chế độ chỗ giữ chỗ (cờ tắt hoặc không có sự kiện bắt buộc).
  const slotFacts =
    factPlan !== null && requiredFactIds(factPlan).length > 0
      ? factPlan.facts
          .filter((fact) => fact.status === 'known')
          .map((fact) => ({ id: fact.id, kind: fact.kind }))
      : null;
  // Chế độ chỗ giữ chỗ: đoạn nguồn chính sách CÙNG chủ đề với sự kiện đã có (hoặc chính đoạn plan lấy làm nguồn) không đưa vào prompt — giá trị đã nằm ở chỗ giữ chỗ, để bộ soạn không chép số/chữ từ văn xuôi (vi-07). Đoạn khác giữ nguyên.
  const slotCoveredTopics = new Set<KbGapTopic>(
    slotFacts === null
      ? []
      : (factPlan?.facts ?? []).flatMap((fact) =>
          fact.status === 'known' && fact.kind in GAP_TOPIC_OF_FACT
            ? [GAP_TOPIC_OF_FACT[fact.kind as FactTopic]]
            : [],
        ),
  );
  const slotPlanSourceIds = new Set(
    slotFacts === null
      ? []
      : (factPlan?.facts ?? []).flatMap((fact) => (fact.status === 'known' ? [fact.sourceId] : [])),
  );
  const promptSources = found.filter(
    (c) =>
      slotFacts === null ||
      c.kind === 'product' ||
      !(
        slotPlanSourceIds.has(c.id) ||
        (c.kind === 'policy' && c.topics.some((topic) => slotCoveredTopics.has(topic)))
      ),
  );
  const draftInput = (d: ActionDecision) => ({
    workspaceId: input.workspaceId,
    question: masked,
    lang: lang === 'other' ? 'vi' : lang,
    kbVersion: input.kbVersion,
    ...(input.variantCount === undefined ? {} : { variantCount: input.variantCount }),
    voice,
    sources: promptSources.map((c) => ({
      id: c.id,
      kind: c.kind,
      text: c.text,
      relevance: c.score,
    })),
    // Có sự kiện trong fact plan thì bộ soạn viết như `answer` (câu mời cho phần chưa rõ do CODE thêm), tránh lời nhắc "mẫu câu mời" trùng với câu mời của code.
    decision:
      slotFacts !== null && d.action === 'redirect'
        ? {
            ...d,
            action: 'answer' as const,
            unansweredTopics: [],
            redirectTemplates: [],
          }
        : d,
    ...(slotFacts !== null && (d.action === 'answer' || d.action === 'redirect')
      ? {
          factSlots: {
            facts: slotFacts,
            required: factPlan === null ? [] : requiredFactIds(factPlan),
          },
        }
      : {}),
    ...(history ? { history } : {}),
  });
  let draft = await deps.drafter.draft(draftInput(decision));
  // DRAFT-FACT-SLOTS: chọn câu ĐẠT guard chỗ giữ chỗ và dùng đủ sự kiện bắt buộc (reply hoặc biến thể), không có thì câu dự phòng do CODE dựng; code điền giá trị, sinh claims/nguồn,
  // thêm câu mời cho chủ đề chưa có thông tin. Không câu nào dùng được → chuyển người. Không gọi LLM thêm (≤ 2 lần/lượt, FR-162).
  let slotRendered: string[] | null = null;
  let slotDiagnostics: SlotDiagnostics | undefined;
  // Cờ TẮT: bản nháp rỗng/không dùng được (cùng định nghĩa FR-140) mà plan có sự kiện bắt buộc → câu dự phòng do code dựng (chưa gọi lại LLM).
  const offFallback =
    !slotMode &&
    planAll !== null &&
    requiredFactIds(planAll).length > 0 &&
    (decision.action === 'answer' || decision.action === 'redirect') &&
    (draft.reply.trim() === '' || (decision.action === 'answer' && draft.needs_human));
  const blockPlan = factPlan ?? (offFallback ? planAll : null);
  if (
    blockPlan !== null &&
    (slotFacts !== null || offFallback) &&
    // `slotFacts !== null` = plan có sự kiện bắt buộc: bộ soạn đặt needs_human trần (không chỗ giữ chỗ, câu rỗng) coi như 0 câu đạt → câu dự phòng do code dựng (không bỏ qua khối này).
    // Plan không có sự kiện bắt buộc thì không vào đây, needs_human đi đường cũ.
    (decision.action === 'answer' || decision.action === 'redirect')
  ) {
    const replyLang = lang === 'en' ? 'en' : 'vi';
    const required = requiredFactIds(blockPlan);
    const passes = (text: string) =>
      checkSlots(text, blockPlan).ok && required.every((id) => slotIds(text).includes(id));
    const candidates = offFallback ? [] : [draft.reply, ...(draft.variants ?? [])].filter(passes);
    const rawTexts = [draft.reply, ...(draft.variants ?? [])];
    const base = candidates[0] ?? fallbackTemplate(blockPlan, replyLang);
    const chosenKind: SlotDiagnostics['chosen'] =
      candidates[0] === undefined
        ? 'fallback'
        : candidates[0] === draft.reply
          ? 'reply'
          : 'variant';
    slotDiagnostics = {
      rawTexts: rawTexts.length,
      rejected: rawTexts.length - candidates.length,
      chosen: chosenKind,
      // Lý do từ chối cứng từng câu (EVAL/chẩn đoán): mã vi phạm guard chỗ giữ chỗ + sự kiện bắt buộc còn thiếu.
      rejections: rawTexts.flatMap((text, index) => {
        const codes = checkSlots(text, blockPlan).violations.map((v) => v.code as string);
        const used = slotIds(text);
        const missing = required.filter((id) => !used.includes(id));
        if (missing.length > 0) codes.push(`missing_required:${missing.join('+')}`);
        return codes.length > 0
          ? [
              {
                text,
                which: index === 0 ? ('reply' as const) : ('variant' as const),
                codes,
              },
            ]
          : [];
      }),
    };
    const filled = base === '' ? null : fillSlots(base, blockPlan, { lang: replyLang });
    if (filled === null || filled.missing.length > 0) {
      decision = handoffDecision('claim_unsupported', decision.askedBefore);
      slotDiagnostics = {
        ...(slotDiagnostics as SlotDiagnostics),
        chosen: 'handoff',
      };
      draft = await deps.drafter.draft(draftInput(decision)); // handoff: bộ soạn không gọi LLM
    } else {
      // Tiếng Anh: "we/us" (xưng hô tiếng Việt của voice không áp dụng); xưng hô tùy chỉnh để trống → "shop".
      const address = describeAddress(voice, replyLang);
      const invite = inviteUnknownText(
        blockPlan.unknownTopics,
        replyLang,
        replyLang === 'en'
          ? { shop: 'we', customer: 'you' }
          : { shop: address.shop || 'shop', customer: address.customer },
      );
      const withInvite = (text: string) => (invite === '' ? text : `${text} ${invite}`);
      const baseIds = new Set(slotIds(base));
      const others = candidates
        .slice(1)
        .filter((text) => slotIds(text).every((id) => baseIds.has(id)))
        .map((text) => withInvite(fillSlots(text, blockPlan, { lang: replyLang }).text));
      slotRendered = filled.rendered;
      draft = {
        ...draft,
        needs_human: false,
        reason: '',
        reply: withInvite(filled.text),
        variants: others,
        sources: filled.sourceIds,
        claims: [
          ...filled.claims,
          ...(invite === '' ? [] : [{ text: invite, source_ids: [], kind: 'greeting' as const }]),
        ],
        unanswered_topics: [
          ...new Set([
            ...draft.unanswered_topics,
            ...blockPlan.unknownTopics.map((topic) => GAP_TOPIC_OF_FACT[topic]),
          ]),
        ],
      };
    }
  }
  let guardTrace: GuardTrace | undefined;
  const usedBy = (d: DraftResult) => found.filter((c) => new Set(d.sources).has(c.id));
  // GUARD-SEMANTIC-SUPPORT: câu khẳng định COD/ship quốc tế/trả góp/… mà nguồn đã dùng KHÔNG nêu (hoặc nguồn nói ngược lại) → KHÔNG gọi LLM soạn lại
  // (giữ ≤ 2 lần gọi LLM/lượt, FR-162): (1) chọn biến thể khác đã có (FR-161) không chứa ý bị loại; (2) không có → câu chuyển hướng THEO MẪU; (3) không còn ý nào để
  // chuyển hướng → chuyển người (`claim_unsupported`). Không bao giờ để câu bịa đi tiếp (nghiêm trọng như sai giá).
  if (!closing && decision.action !== 'handoff' && slotRendered === null) {
    const sourceTexts = usedBy(draft).map((c) => c.text);
    const supported = (text: string) =>
      checkConceptSupport({ reply: text, sources: sourceTexts }).ok;
    const check = checkConceptSupport({
      reply: draft.reply,
      sources: sourceTexts,
    });
    if (!check.ok) {
      guardTrace = {
        concept: {
          concepts: check.violations.map((v) => v.concept),
          draftReply: draft.reply,
          usedIds: [...draft.sources],
        },
      };
      const variants = draft.variants ?? [];
      const clean = variants.find(supported);
      if (clean !== undefined) {
        draft = {
          ...draft,
          reply: clean,
          variants: variants.filter((v) => v !== clean && supported(v)),
          claims: draft.claims.filter((claim) => supported(claim.text)),
        };
      } else {
        const strict = decideFor(true);
        if (strict.action === 'answer' || strict.action === 'handoff') {
          decision = handoffDecision('claim_unsupported', decision.askedBefore);
          draft = await deps.drafter.draft(draftInput(decision)); // handoff: bộ soạn không gọi LLM
        } else {
          decision = strict;
          const replyLang = lang === 'en' ? 'en' : 'vi';
          draft = {
            reply: unsupportedConceptReply(
              check.violations.map((v) => v.concept),
              replyLang,
            ),
            lang: replyLang,
            sources: [],
            claims: [],
            unanswered_topics: strict.unansweredTopics,
            needs_human: false,
            reason: '',
            variants: [],
          };
        }
      }
    }
  }

  // Lưới an toàn (ADR 017): chế độ chỗ giữ chỗ mà câu CHƯA được code điền (vd. bộ soạn đánh dấu needs_human nhưng vẫn viết {fact:…}) thì KHÔNG bao giờ để mã chỗ giữ chỗ lọt tới khách → chuyển người.
  if (
    factPlan !== null &&
    slotRendered === null &&
    decision.action !== 'handoff' &&
    [draft.reply, ...(draft.variants ?? [])].some((text) => /{fact:/.test(text))
  ) {
    decision = handoffDecision('claim_unsupported', decision.askedBefore);
    slotDiagnostics = {
      rawTexts: 1 + (draft.variants?.length ?? 0),
      rejected: 1 + (draft.variants?.length ?? 0),
      chosen: 'handoff',
      finalNetTriggered: true,
    };
    draft = await deps.drafter.draft(draftInput(decision)); // handoff: bộ soạn không gọi LLM
  }

  // FR-140: bản nháp KHÔNG dùng được (bộ soạn đánh dấu needs_human — vd. claim trỏ nguồn sai — hoặc reply rỗng) mà hành động vẫn là answer/redirect/clarify → KHÔNG để nhãn "trả lời" đi kèm câu rỗng:
  // đổi thành chuyển người (không gọi LLM thêm). Câu rỗng chỉ hợp lệ khi hành động là handoff.
  let draftUnusable = false;
  if (
    decision.action !== 'handoff' &&
    slotRendered === null &&
    // needs_human là bình thường ở redirect/clarify (mời nhân viên); chỉ KHÔNG dùng được khi câu rỗng, hoặc action là answer mà bộ soạn lại xin người.
    (draft.reply.trim() === '' || (decision.action === 'answer' && draft.needs_human))
  ) {
    draftUnusable = true;
    decision = handoffDecision('claim_unsupported', decision.askedBefore);
    draft = await deps.drafter.draft(draftInput(decision)); // handoff: bộ soạn không gọi LLM
  }

  const usedIds = new Set(draft.sources);
  const used = found.filter((c) => usedIds.has(c.id));
  // Chế độ chỗ giữ chỗ: mọi số trong câu do code điền → kiểm số tiền với CHÍNH các giá trị vừa điền (không phải đoạn văn).
  const guardSources = slotRendered ?? used.map((c) => c.text);
  let guardResult = checkGuardMoney({
    reply: draft.reply,
    sources: guardSources,
  });
  // Nhãn biến thể/tên của sản phẩm ĐÃ nhận diện (đọc từ products/product_variants, không phải đoạn văn) là nguồn hợp lệ: số trong mã biến thể
  // ("WMT8050PAPER") không phải số tiền do AI bịa. Chỉ tra khi guard báo vi phạm (không thêm truy vấn ở đường thường).
  if (!guardResult.ok && products.ids.length > 0 && deps.knowledge.lookupPlanProducts) {
    const owned =
      planProducts.length > 0
        ? planProducts
        : await deps.knowledge.lookupPlanProducts(products.ids);
    const labelSources = owned.flatMap((product) =>
      product.variants.map((variant) => variant.label),
    );
    if (labelSources.length > 0) {
      guardResult = checkGuardMoney({
        reply: draft.reply,
        sources: [...guardSources, ...labelSources],
      });
    }
  }
  const planSourceIds =
    slotRendered === null || blockPlan === null
      ? []
      : blockPlan.facts.flatMap((fact) => (fact.status === 'known' ? [fact.sourceId] : []));
  const replyGuard = checkReplyGuard({
    reply: draft.reply,
    lang: lang === 'other' ? 'vi' : lang,
    voice,
    claims: draft.claims,
    allowedSourceIds: new Set([
      ...found.filter((c) => c.score >= DEFAULT_MIN_RELEVANCE).map((c) => c.id),
      ...planSourceIds,
    ]),
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
    allowedSourceIds: new Set([
      ...found.filter((c) => c.score >= DEFAULT_MIN_RELEVANCE).map((c) => c.id),
      ...planSourceIds,
    ]),
  });

  return {
    status: 'done',
    billed: false,
    maskedText: masked,
    normalizedText: normalized.normalized,
    resolvedProductIds: products.ids,
    conversationState: nextConversationState({
      action: decision.action,
      productIds: products.ids,
      asks: extract.asks,
    }),
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
    riskReasons: {
      ...turnRisks.reasons,
      legal: factPlan === null ? turnRisks.reasons.legal : legalReasons,
      ...(planAll?.requiresHumanReview || draftUnusable
        ? {
            review: [
              ...(planAll?.requiresHumanReview ? ['defect_warranty_scope'] : []),
              ...(draftUnusable ? ['fr140_draft_unusable'] : []),
            ],
          }
        : {}),
    },
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
    ...(factPlan === null ? {} : { factPlan }),
    ...(slotDiagnostics ? { slotDiagnostics } : {}),
    ...(guardTrace ? { guardTrace } : {}),
    gapTopics: {
      plan: [...new Set((planAll?.unknownTopics ?? []).map((t) => GAP_TOPIC_OF_FACT[t]))],
      fallback: fallbackGapTopics(factTopics, extract.asks),
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
export type SlotDiagnostics = {
  rawTexts: number;
  rejected: number;
  chosen: 'reply' | 'variant' | 'fallback' | 'handoff';
  /** Lưới chặn CUỐI (mã {fact:…} còn sót sau bước kiểm/điền) đã kích hoạt — mục tiêu 0. */
  finalNetTriggered?: boolean;
  rejections?: Array<{
    text: string;
    which: 'reply' | 'variant';
    codes: string[];
  }>;
};

export const runTryPipeline = runPipeline;

export type PipelineInput = TryInput;
export type PipelineDeps = TryDeps;
export type PipelineResult = TryResult;
