import { COMMENT_LABELS, KB_GAP_TOPICS, type KbGapTopic } from '@flow/shared';
import { z } from 'zod';
import type { ActionKind } from '../confidence/confidence';

/**
 * `decideAction` (FR-147, FR-141, `docs/09` §4): CODE chọn một trong bốn hành động, AI chỉ viết câu
 * (nguyên tắc #9). Thứ tự xét: rủi ro → thiếu thông tin phía khách (hỏi lại) → thiếu thông tin phía shop
 * (chuyển hướng, trả lời một phần) → trả lời. Hàm thuần, không LLM/DB; đầu vào hỏng → chuyển người, không ném.
 *
 * Phát hiện lệch giá / tồn kho cũ / pháp lý / mạo danh là việc `DA-RULES-*`: ở đây chỉ nhận CỜ.
 */

/** Chủ đề `kb_gaps.topic` (`docs/10`): một nguồn ở `@flow/shared` (RETRIEVAL-LOG); re-export cho nơi import từ đây. */
export { KB_GAP_TOPICS, type KbGapTopic };

/** Khóa mẫu câu mời `brand_voice.handoff_templates` (`docs/10`, FR-141/FR-152). */
export const HANDOFF_TEMPLATE_KEYS = [
  'shipping',
  'discount',
  'order_status',
  'stock_check',
  'other',
] as const;
export type HandoffTemplateKey = (typeof HANDOFF_TEMPLATE_KEYS)[number];

export const VARIANT_AXES = ['size', 'color'] as const;
export type VariantAxis = (typeof VARIANT_AXES)[number];

export const CLARIFY_ASKS = ['product', 'variant', 'body_measure', 'intent'] as const;
export type ClarifyAskKind = (typeof CLARIFY_ASKS)[number];

export const DECISION_REASONS = [
  'all_sourced',
  'input_unreadable',
  'lang_other',
  'complaint',
  'impersonation',
  'price_conflict',
  'legal_unsourced',
  'repeat_limit',
  'clarify_limit',
  'image_product',
  'product_ambiguous',
  'variant_missing',
  'body_measure_missing',
  'question_vague',
  'topic_unsourced',
  'stock_stale',
  'order_status',
] as const;
export type DecisionReason = (typeof DECISION_REASONS)[number];

/**
 * Cổng tự gửi nào áp dụng cho câu này (giá trị cài đặt đọc ở AUTO-SEND-GATE, `docs/09` §6 mục 6).
 * Đây là MỨC SÀN tính trước khi soạn: câu `clarify`/`redirect` mà bản nháp lại có ý `fact` thì cổng phải
 * nâng `allow_clarify` → `allow_partial` bằng `effectiveAutoSendPolicy`, không dùng nguyên giá trị này.
 */
export const AUTO_SEND_POLICIES = ['standard', 'allow_clarify', 'allow_partial', 'never'] as const;
export type AutoSendPolicy = (typeof AUTO_SEND_POLICIES)[number];

/**
 * Chính sách thật sau khi có bản nháp: `allow_clarify` chỉ dành cho câu KHÔNG có ý `fact` (§6 mục 6);
 * có ý `fact` → xét `allow_partial`. `never`/`standard`/`allow_partial` giữ nguyên.
 */
export function effectiveAutoSendPolicy(
  policy: AutoSendPolicy,
  draft: { claims: ReadonlyArray<{ kind: string }> },
): AutoSendPolicy {
  if (policy === 'allow_clarify' && draft.claims.some((claim) => claim.kind === 'fact')) {
    return 'allow_partial';
  }
  return policy;
}

/** Tối đa 2 lần hỏi lại mỗi chuỗi (FR-147); quá → chuyển người. */
export const MAX_CLARIFY_PER_THREAD = 2;
/** Khách hỏi lại cùng ý ≥ 3 lần → chuyển người (FR-144, §6 mục 6). */
export const REPEAT_HANDOFF_THRESHOLD = 3;
/** Số lựa chọn gợi ý tối đa trong câu hỏi lại. */
export const MAX_CLARIFY_OPTIONS = 3;

const nonNegativeInt = z.number().int().min(0);

export const decideActionInputSchema = z.object({
  lang: z.enum(['vi', 'en', 'other']),
  /** Phần cần dùng của `ExtractResult` (trường thừa bị bỏ). */
  extract: z
    .object({
      labels: z.array(z.object({ label: z.enum(COMMENT_LABELS) }).loose()).min(1),
      refers_to_image: z.boolean(),
      size: z.string().nullable(),
      color: z.string().nullable(),
      height_cm: z.number().positive().nullable(),
      weight_kg: z.number().positive().nullable(),
    })
    .loose(),
  products: z.object({
    /** Tên sản phẩm đã nhận ra (bài gắn / bí danh / tìm gần đúng); 1 = đã nhận, >1 = chưa rõ mẫu nào. */
    candidates: z.array(z.string().trim().min(1).max(120)).max(20),
    /** Trục biến thể còn khác giá/tồn giữa các biến thể của sản phẩm đã nhận (do bước tra DB cấp). */
    missingAxes: z.array(z.enum(VARIANT_AXES)),
  }),
  /** Mỗi ý khách hỏi theo chủ đề; `sourced` = bước tìm kiếm có nguồn trả lời được. */
  topics: z.array(z.object({ topic: z.enum(KB_GAP_TOPICS), sourced: z.boolean() })),
  thread: z.object({
    /** Số lần AI/shop đã hỏi lại trong cùng chuỗi. */
    clarifyCount: nonNegativeInt,
    /** Số lần khách hỏi lại cùng một ý (FR-144). */
    repeatCount: nonNegativeInt,
  }),
  /** Cờ rủi ro do `DA-RULES-*` cấp. BẮT BUỘC đủ cờ: thiếu = không đọc được → chuyển người (không "mở khi lỗi"). */
  risks: z.object({
    priceConflict: z.boolean(),
    legalUnsourced: z.boolean(),
    impersonation: z.boolean(),
    stockStale: z.boolean(),
  }),
});

export type DecideActionInput = z.input<typeof decideActionInputSchema>;
type ParsedInput = z.output<typeof decideActionInputSchema>;

export type ClarifyAsk = {
  ask: ClarifyAskKind;
  /** Trục biến thể cần hỏi (chỉ khi `ask = variant`). */
  axes: VariantAxis[];
  /** Gợi ý lựa chọn (tên mẫu) để câu hỏi cụ thể. */
  options: string[];
};

export type ActionDecision = {
  action: ActionKind;
  reason: DecisionReason;
  /** Không bao giờ tự gửi (cổng 6). */
  needsHuman: boolean;
  /** Gắn tag "Cần hỗ trợ thêm" + ghi `kb_gaps` (FR-141). */
  needsSupportTag: boolean;
  clarify: ClarifyAsk | null;
  answeredTopics: KbGapTopic[];
  unansweredTopics: KbGapTopic[];
  /** Khóa mẫu câu mời cần dùng khi chuyển hướng. */
  redirectTemplates: HandoffTemplateKey[];
  autoSendPolicy: AutoSendPolicy;
  /** Tín hiệu `asked_before` của độ tin cậy (§6.0). */
  askedBefore: boolean;
};

export function readDecideActionInput(raw: unknown): ParsedInput | null {
  const parsed = decideActionInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function handoff(reason: DecisionReason, askedBefore = false): ActionDecision {
  return {
    action: 'handoff',
    reason,
    needsHuman: true,
    needsSupportTag: false,
    clarify: null,
    answeredTopics: [],
    unansweredTopics: [],
    redirectTemplates: [],
    autoSendPolicy: 'never',
    askedBefore,
  };
}

/** Bậc 4 — rủi ro luôn thắng (FR-147 mục 4, FR-145, FR-159, FR-144). */
function riskReason(input: ParsedInput): DecisionReason | null {
  if (input.lang === 'other') return 'lang_other';
  if (input.extract.labels.some((item) => item.label === 'complaint')) return 'complaint';
  if (input.risks.impersonation) return 'impersonation';
  if (input.risks.priceConflict) return 'price_conflict';
  if (input.risks.legalUnsourced) return 'legal_unsourced';
  if (input.thread.repeatCount >= REPEAT_HANDOFF_THRESHOLD) return 'repeat_limit';
  return null;
}

/** Gom ý theo chủ đề, thứ tự cố định; một chủ đề có ý chưa nguồn → coi là chưa nguồn (thiên về chặn). */
function splitTopics(input: ParsedInput): { answered: KbGapTopic[]; unanswered: KbGapTopic[] } {
  const answered: KbGapTopic[] = [];
  const unanswered: KbGapTopic[] = [];
  for (const topic of KB_GAP_TOPICS) {
    const items = input.topics.filter((item) => item.topic === topic);
    if (items.length === 0) continue;
    (items.every((item) => item.sourced) ? answered : unanswered).push(topic);
  }
  return { answered, unanswered };
}

const TEMPLATE_BY_TOPIC: Record<KbGapTopic, HandoffTemplateKey> = {
  shipping: 'shipping',
  discount: 'discount',
  order_status: 'order_status',
  product_info: 'other',
  policy: 'other',
  size: 'other',
  other: 'other',
};

function templatesFor(unanswered: KbGapTopic[], stockStale: boolean): HandoffTemplateKey[] {
  const wanted = new Set<HandoffTemplateKey>(unanswered.map((topic) => TEMPLATE_BY_TOPIC[topic]));
  if (stockStale) wanted.add('stock_check');
  return HANDOFF_TEMPLATE_KEYS.filter((key) => wanted.has(key));
}

/** Trục biến thể còn phải hỏi = trục khác giá/tồn trừ trục khách đã nói. */
function axesToAsk(input: ParsedInput): VariantAxis[] {
  const said: Record<VariantAxis, boolean> = {
    size: input.extract.size !== null,
    color: input.extract.color !== null,
  };
  return VARIANT_AXES.filter((axis) => input.products.missingAxes.includes(axis) && !said[axis]);
}

/** Câu hỏi có nhắm vào sản phẩm không (để quyết định có cần hỏi "mẫu nào"). */
function asksAboutProduct(
  input: ParsedInput,
  answered: KbGapTopic[],
  unanswered: KbGapTopic[],
): boolean {
  const topics = [...answered, ...unanswered];
  return (
    topics.length === 0 ||
    topics.some((topic) => topic === 'product_info' || topic === 'size') ||
    input.extract.labels.some((item) => item.label === 'price' || item.label === 'purchase')
  );
}

type ClarifyNeed = { reason: DecisionReason; clarify: ClarifyAsk; needsHuman: boolean };

/** Bậc 2 — thiếu thông tin phía khách; chọn ĐÚNG MỘT câu hỏi theo ưu tiên (FR-147 mục 2). */
function clarifyNeed(
  input: ParsedInput,
  answered: KbGapTopic[],
  unanswered: KbGapTopic[],
): ClarifyNeed | null {
  const { candidates } = input.products;
  const options = candidates.slice(0, MAX_CLARIFY_OPTIONS);
  const productResolved = candidates.length === 1;

  // Ảnh mà chưa nhận ra sản phẩm: hỏi mẫu nào nhưng vẫn cần người (FR-143, §6 mục 6).
  if (input.extract.refers_to_image && !productResolved) {
    return {
      reason: 'image_product',
      clarify: { ask: 'product', axes: [], options },
      needsHuman: true,
    };
  }
  if (candidates.length > 1 && asksAboutProduct(input, answered, unanswered)) {
    return {
      reason: 'product_ambiguous',
      clarify: { ask: 'product', axes: [], options },
      needsHuman: false,
    };
  }
  if (productResolved) {
    const axes = axesToAsk(input);
    if (axes.length > 0) {
      return {
        reason: 'variant_missing',
        clarify: { ask: 'variant', axes, options: [] },
        needsHuman: false,
      };
    }
  }
  // Hỏi size có bảng size (nguồn) nhưng thiếu số đo (FR-149); không có bảng → bậc 3 xử lý.
  const sizeSourced = answered.includes('size');
  if (sizeSourced && (input.extract.height_cm === null || input.extract.weight_kg === null)) {
    return {
      reason: 'body_measure_missing',
      clarify: { ask: 'body_measure', axes: [], options: [] },
      needsHuman: false,
    };
  }
  if (answered.length + unanswered.length === 0 && candidates.length === 0) {
    return {
      reason: 'question_vague',
      clarify: { ask: 'intent', axes: [], options: [] },
      needsHuman: false,
    };
  }
  return null;
}

/**
 * Chọn hành động cho một lượt. Nhận `unknown` để mọi đầu vào hỏng đều về `handoff` thay vì ném.
 */
export function decideAction(raw: unknown): ActionDecision {
  const input = readDecideActionInput(raw);
  if (input === null) return handoff('input_unreadable');

  const askedBefore = input.thread.clarifyCount > 0;
  const risk = riskReason(input);
  if (risk !== null) return handoff(risk, askedBefore);

  const { answered, unanswered } = splitTopics(input);

  // FR-153: hỏi đơn hàng → chuyển hướng ib + chuyển người (chưa đọc dữ liệu đơn, kể cả khi có "nguồn").
  if (answered.includes('order_status') || unanswered.includes('order_status')) {
    const rest = answered.filter((topic) => topic !== 'order_status');
    const missing = KB_GAP_TOPICS.filter(
      (topic) => topic === 'order_status' || unanswered.includes(topic),
    );
    return {
      action: 'redirect',
      reason: 'order_status',
      needsHuman: true,
      needsSupportTag: true,
      clarify: null,
      answeredTopics: rest,
      unansweredTopics: missing,
      redirectTemplates: templatesFor(missing, input.risks.stockStale),
      autoSendPolicy: 'never',
      askedBefore,
    };
  }

  const need = clarifyNeed(input, answered, unanswered);
  if (need !== null) {
    if (input.thread.clarifyCount >= MAX_CLARIFY_PER_THREAD)
      return handoff('clarify_limit', askedBefore);
    return {
      action: 'clarify',
      reason: need.reason,
      needsHuman: need.needsHuman,
      needsSupportTag: false,
      clarify: need.clarify,
      answeredTopics: answered,
      unansweredTopics: unanswered,
      redirectTemplates: [],
      autoSendPolicy: need.needsHuman ? 'never' : 'allow_clarify',
      askedBefore,
    };
  }

  const stockStale = input.risks.stockStale;
  if (unanswered.length > 0 || stockStale) {
    return {
      action: 'redirect',
      reason: unanswered.length > 0 ? 'topic_unsourced' : 'stock_stale',
      needsHuman: false,
      needsSupportTag: true,
      clarify: null,
      answeredTopics: answered,
      unansweredTopics: unanswered,
      redirectTemplates: templatesFor(unanswered, stockStale),
      // Có phần trả lời được (ý fact) → xét `allow_partial`; chỉ câu mời → xét `allow_clarify` (§6 mục 6).
      autoSendPolicy: answered.length > 0 ? 'allow_partial' : 'allow_clarify',
      askedBefore,
    };
  }

  return {
    action: 'answer',
    reason: 'all_sourced',
    needsHuman: false,
    needsSupportTag: false,
    clarify: null,
    answeredTopics: answered,
    unansweredTopics: [],
    redirectTemplates: [],
    autoSendPolicy: 'standard',
    askedBefore,
  };
}
