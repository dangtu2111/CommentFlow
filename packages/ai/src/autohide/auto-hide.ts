import { type ExtractedContacts, extractPii, matchSpamRule } from '@flow/shared';
import { z } from 'zod';
import { type ContactSink, maskAndCapture } from '../pii';

/**
 * Tự ẩn bình luận chứa SĐT/link (docs/05 FR-081, ADR 009, Q-AH1). Hàm thuần + quy trình nhỏ qua interface.
 * AI KHÔNG BAO GIỜ tự ẩn (AGENTS.md nguyên tắc #3): đầu vào của `planAutoHide` cố ý không có nhãn/độ tin cậy/điểm
 * của model — chỉ văn bản, trạng thái và quy tắc do Owner bật. Cờ `AUTO_HIDE_ENABLED` mặc định TẮT.
 */

export type AutoHideConfig = { enabled: boolean };

/** Chỉ đúng chữ `true` mới bật (đường tác động lên nền tảng thật). */
export function loadAutoHideConfig(env: Record<string, string | undefined>): AutoHideConfig {
  return { enabled: env.AUTO_HIDE_ENABLED === 'true' };
}

/** Tự ẩn chỉ áp cho SĐT và link (FR-081); loại quy tắc khác không bao giờ ẩn. */
export const AUTO_HIDE_RULE_TYPES = ['phone', 'link'] as const;
export type AutoHideRuleType = (typeof AUTO_HIDE_RULE_TYPES)[number];

/** Bình luận chưa xử lý mới được tự ẩn (khớp trạng thái hợp lệ để ẩn ở `cf.request_comment_hide`). */
export const AUTO_HIDE_ELIGIBLE_STATUSES = [
  'new',
  'pending_review',
  'needs_human',
  'spam_suspected',
] as const;

export type AutoHideRule = {
  type: AutoHideRuleType;
  enabled: boolean;
  /** Còn hạn → chạy thử: chỉ ghi "sẽ ẩn", không ẩn thật (cột `rules.shadow_until`). */
  shadowUntil: Date | null;
};

export type AutoHideComment = {
  id: string;
  text: string;
  isOwn: boolean;
  deleted: boolean;
  isHidden: boolean;
  status: string;
};

const inputSchema = z.object({
  config: z.object({ enabled: z.boolean() }),
  rules: z.array(
    z.object({
      type: z.string(),
      enabled: z.boolean(),
      shadowUntil: z.date().nullable(),
    }),
  ),
  comment: z.object({
    id: z.string().min(1),
    text: z.string(),
    isOwn: z.boolean(),
    deleted: z.boolean(),
    isHidden: z.boolean(),
    status: z.string(),
  }),
  now: z.date(),
});

export type AutoHideSkipReason =
  | 'disabled'
  | 'invalid_input'
  | 'own'
  | 'deleted'
  | 'already_hidden'
  | 'status'
  | 'no_rule';

export type AutoHidePlan =
  | { outcome: 'skip'; reason: AutoHideSkipReason }
  | { outcome: 'would_hide'; matched: AutoHideRuleType[] }
  | {
      outcome: 'hide';
      matched: AutoHideRuleType[];
      /** Liên hệ gốc (chưa che) — phải lưu vào Khách tiềm năng TRƯỚC khi ẩn; không log. */
      contacts: ExtractedContacts;
    };

const isAutoHideType = (t: string): t is AutoHideRuleType =>
  (AUTO_HIDE_RULE_TYPES as readonly string[]).includes(t);
const isEligibleStatus = (s: string): boolean =>
  (AUTO_HIDE_ELIGIBLE_STATUSES as readonly string[]).includes(s);

function skip(reason: AutoHideSkipReason): AutoHidePlan {
  return { outcome: 'skip', reason };
}

/** Quyết định thuần: có ẩn bình luận này không. Không ném lỗi; đầu vào hỏng → `skip`. */
export function planAutoHide(input: {
  config: AutoHideConfig;
  rules: readonly AutoHideRule[];
  comment: AutoHideComment;
  now: Date;
}): AutoHidePlan {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return skip('invalid_input');
  const { config, rules, comment, now } = parsed.data;

  if (!config.enabled) return skip('disabled');
  if (comment.isOwn) return skip('own');
  if (comment.deleted) return skip('deleted');
  if (comment.isHidden) return skip('already_hidden');
  if (!isEligibleStatus(comment.status)) return skip('status');

  const live: AutoHideRuleType[] = [];
  const shadow: AutoHideRuleType[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !isAutoHideType(rule.type)) continue;
    const spamRule = { name: rule.type, type: rule.type, pattern: '', action: 'mark' } as const;
    if (!matchSpamRule(spamRule, comment)) continue;
    const inShadow = rule.shadowUntil !== null && rule.shadowUntil.getTime() > now.getTime();
    (inShadow ? shadow : live).push(rule.type);
  }

  if (live.length > 0)
    return { outcome: 'hide', matched: live, contacts: extractPii(comment.text) };
  if (shadow.length > 0) return { outcome: 'would_hide', matched: shadow };
  return skip('no_rule');
}

/**
 * Nơi gửi yêu cầu ẩn vào outbox `comment_hides` (ADR 009). Interface: bản thật gọi hàm DEFINER cho hệ thống
 * (`AUTO-HIDE-DB`, cần migration làn b); trả id yêu cầu hoặc `null` khi không có việc mới (idempotent).
 */
export interface HideRequester {
  requestHide(commentId: string): Promise<string | null>;
}

export type AutoHideResult =
  | { outcome: 'skip'; reason: AutoHideSkipReason }
  | { outcome: 'would_hide'; matched: AutoHideRuleType[] }
  | { outcome: 'hide_requested'; hideId: string | null; matched: AutoHideRuleType[] }
  | { outcome: 'held'; reason: 'lead_save_failed' }
  | { outcome: 'hide_failed'; reason: 'hide_request_failed' };

/**
 * Lưu khách tiềm năng TRƯỚC, ẩn SAU (FR-081). Lưu lỗi → KHÔNG ẩn (giữ nguyên cho người xử lý, Q-AH1) để không mất
 * liên hệ. Kết quả lỗi chỉ mang mã cố định — không chứa nội dung/SĐT (nguyên tắc #6).
 */
export async function runAutoHide(
  input: {
    workspaceId: string;
    config: AutoHideConfig;
    rules: readonly AutoHideRule[];
    comment: AutoHideComment;
    now: Date;
  },
  deps: { contactSink: ContactSink; hideRequester: HideRequester },
): Promise<AutoHideResult> {
  const plan = planAutoHide(input);
  if (plan.outcome !== 'hide') return plan;

  const captured = await maskAndCapture(
    { workspaceId: input.workspaceId, sourceId: input.comment.id, text: input.comment.text },
    deps.contactSink,
  );
  if (!captured.saved) return { outcome: 'held', reason: 'lead_save_failed' };

  try {
    const hideId = await deps.hideRequester.requestHide(input.comment.id);
    return { outcome: 'hide_requested', hideId, matched: plan.matched };
  } catch {
    // Không đính kèm lỗi gốc: thông báo của driver có thể chứa nội dung bình luận.
    return { outcome: 'hide_failed', reason: 'hide_request_failed' };
  }
}
