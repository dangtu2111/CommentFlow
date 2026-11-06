import { z } from 'zod';
import { AUTOMATION_MODES } from '../gate/auto-send-gate';

/**
 * `sendRecheck` (FR-110, `docs/09` §6.1) — lớp bảo vệ THỨ HAI, chạy ngay trước khi job `send` gọi API nền tảng.
 * `decideAutoSend` (§6) chạy lúc soạn; trong khoảng trễ/hàng đợi trạng thái có thể đổi (đã có người trả lời, bị ẩn,
 * kênh mất kết nối, Dừng khẩn cấp, giá đổi, KB đổi, hết lượt, cửa sổ tin nhắn đóng, hết hạn mức tốc độ).
 *
 * Hàm thuần: nhận dữ liệu ĐÃ ĐO do nơi gọi đọc trong cùng giao dịch khóa dòng (`SELECT … FOR UPDATE`), không gọi
 * DB/mạng/LLM. Kiểm R1–R9 đúng thứ tự; trượt điều kiện nào → `rule = recheck:R#` (ghi `comment_replies.error_code`,
 * `automation_events.gate`) + mã lý do + cách xử lý theo cột "Trượt thì" của §6.1. Đầu vào hỏng → `rule = input`,
 * không gửi, không ném (thiên về chặn). Chế độ tự gửi mà thiếu dữ liệu của R4/R6/R7 → trượt (không "mở mãi").
 * Module KHÔNG có đường ra lệnh ẩn hay gửi.
 */

export const RECHECK_COUNT = 9;
export const RECHECK_MODES = ['human', 'auto'] as const;
export type RecheckMode = (typeof RECHECK_MODES)[number];

/** Cách xử lý khi trượt (cột "Trượt thì" §6.1). `defer` = hoãn job, không tính là lỗi. */
export const RECHECK_ACTIONS = [
  'cancel',
  'channel_error',
  'hold_review',
  'ask_confirm',
  'defer',
] as const;
export type RecheckAction = (typeof RECHECK_ACTIONS)[number];

/**
 * Trạng thái bình luận còn được phép gửi (R1) THEO CHẾ ĐỘ: người bấm Gửi → chỉ `sending` (ADR 008); AI tự gửi → đang
 * chờ khoảng trễ `scheduled_auto` hoặc đã được đánh dấu `sending`. Người gửi KHÔNG được gửi đè lên câu AI đã lên lịch.
 */
export const RECHECK_SENDABLE_STATUSES: Readonly<Record<RecheckMode, readonly string[]>> =
  Object.freeze({
    human: Object.freeze(['sending']),
    auto: Object.freeze(['scheduled_auto', 'sending']),
  });

/** Cửa sổ nhắn tin (R8): tự động 24 giờ; người gửi có thẻ HUMAN_AGENT 7 ngày. */
export const AUTO_MESSAGE_WINDOW_MS = 24 * 3_600_000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 3_600_000;
/** Lệch đồng hồ chấp nhận được khi mốc tin cuối ở "tương lai"; quá → dữ liệu hỏng, chặn. */
export const RECHECK_CLOCK_SKEW_MS = 5 * 60_000;

export const RECHECK_REASONS = [
  'input_unreadable',
  // R1
  'already_replied',
  'status_changed',
  // R2
  'comment_deleted',
  'comment_hidden',
  'comment_merged',
  // R3
  'channel_disconnected',
  'channel_send_suspended',
  // R4
  'automation_unknown',
  'workspace_ai_off',
  'emergency_stopped',
  'ai_paused',
  'mode_not_auto',
  // R5
  'price_unknown',
  'price_snapshot_missing',
  'price_changed',
  // R6
  'kb_unknown',
  'kb_changed',
  // R7
  'quota_unknown',
  'quota_exhausted',
  'cost_cap_reached',
  'daily_cap_reached',
  // R8
  'message_window_closed',
  // R9
  'rate_limited',
] as const;
export type RecheckReason = (typeof RECHECK_REASONS)[number];

/** Nhãn điều kiện để hiện "Không gửi vì…" (chỉ số = số R). */
export const RECHECK_LABELS: Readonly<Record<number, string>> = Object.freeze({
  1: 'Bình luận đã được trả lời / đổi trạng thái',
  2: 'Bình luận đã bị xóa, ẩn hoặc gộp',
  3: 'Kênh mất kết nối hoặc bị tạm khóa gửi',
  4: 'Workspace dừng khẩn cấp / AI tạm dừng / mức không còn Tự động',
  5: 'Giá hoặc tồn kho đã đổi',
  6: 'Cơ sở kiến thức đã đổi',
  7: 'Hết lượt / vượt trần chi phí / vượt giới hạn tự gửi trong ngày',
  8: 'Cửa sổ nhắn tin đã đóng',
  9: 'Hết hạn mức tốc độ gửi theo Page',
});

const nonNegativeInt = z.number().int().min(0);
const nonNegative = z.number().finite().min(0);

/** Chuỗi ISO 8601 (có giờ) hoặc `Date` hợp lệ; dạng khác → đầu vào hỏng. */
const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => Number.isFinite(d.getTime()), 'Thời điểm không hợp lệ');

const priceEntrySchema = z.object({
  productId: z.string().min(1),
  priceVnd: nonNegativeInt,
  /** `products.updated_from_source_at`; `null` = chưa đồng bộ từ nguồn. */
  updatedFromSourceAt: instant.nullable(),
});
export type RecheckPriceEntry = z.input<typeof priceEntrySchema>;

export const sendRecheckInputSchema = z.object({
  /** `human` = nhân viên bấm Gửi; `auto` = AI tự gửi (R4, R6, R7 chỉ áp dụng cho `auto`). */
  mode: z.enum(RECHECK_MODES),
  target: z.enum(['comment', 'message']),
  now: instant,
  comment: z.object({
    status: z.string().min(1),
    externalReplyId: z.string().nullable(),
    isHidden: z.boolean(),
    mergedIntoId: z.string().nullable(),
    deletedAt: instant.nullable(),
  }),
  channel: z.object({
    status: z.string().min(1),
    /** `send_suspended_until > now()` (§11) — do nơi gọi tính. */
    sendSuspended: z.boolean(),
  }),
  /** R4 (chỉ tự gửi): cài đặt tự động đọc lại lúc gửi; `null` = không đọc được → trượt. */
  automation: z
    .object({
      aiEnabled: z.boolean(),
      emergencyStopped: z.boolean(),
      /** AI tự tạm dừng (vượt tỉ lệ sửa, lỗi liên tiếp…). */
      aiPaused: z.boolean(),
      /** Mức kênh × nhãn (× ngôn ngữ) hiện tại. */
      level: z.enum(AUTOMATION_MODES),
    })
    .nullable(),
  /**
   * R5: `hasMoney` DO CODE DÒ từ nội dung câu (không lấy từ AI); `true` → so ảnh chụp `drafts.price_snapshot` với giá
   * hiện tại từ `products`/`product_variants`. `null` = nơi gọi chưa xác định: tự gửi → trượt; người gửi (chưa có bản
   * nháp AI) → bỏ qua.
   */
  price: z
    .object({
      hasMoney: z.boolean(),
      snapshot: z.array(priceEntrySchema),
      current: z.array(priceEntrySchema),
    })
    .nullable(),
  /** R6 (chỉ tự gửi): `drafts.kb_version` và phiên bản hiện tại; `changeAffectsDraft` do code xét danh mục ảnh hưởng. */
  kb: z
    .object({
      draftVersion: z.string().min(1),
      currentVersion: z.string().min(1),
      changeAffectsDraft: z.boolean(),
    })
    .nullable(),
  /** R7 (chỉ tự gửi): `null` ở từng trường = không giới hạn; cả object `null` = không đọc được → trượt. */
  quota: z
    .object({
      turnsRemaining: nonNegativeInt.nullable(),
      aiCostCapUsd: nonNegative.nullable(),
      aiCostMonthUsd: nonNegative,
      dailyCap: nonNegativeInt.nullable(),
      autoSentToday: nonNegativeInt,
    })
    .nullable(),
  /** R8 (tin nhắn): tin cuối của khách; `humanAgent` = người gửi được dùng thẻ HUMAN_AGENT (7 ngày). */
  message: z.object({ lastInboundAt: instant, humanAgent: z.boolean() }).nullable(),
  /** R9: lượt còn lại của hạn mức tốc độ theo Page; `null` = chưa có bộ giới hạn (`SEND-RATE-LIMIT`) → qua. */
  rate: z.object({ remaining: nonNegativeInt }).nullable(),
});

export type SendRecheckInput = z.input<typeof sendRecheckInputSchema>;
type Parsed = z.output<typeof sendRecheckInputSchema>;

export type SendRecheckResult =
  | { ok: true; rule: null; reason: null; action: null; rulesPassed: number }
  | {
      ok: false;
      /** `recheck:R1`…`recheck:R9`, hoặc `recheck:input` khi đầu vào hỏng. */
      rule: string;
      reason: RecheckReason;
      action: RecheckAction;
      /** Số điều kiện đã qua trước khi trượt. */
      rulesPassed: number;
    };

export function readSendRecheckInput(raw: unknown): Parsed | null {
  const parsed = sendRecheckInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type Failure = { reason: RecheckReason; action: RecheckAction };
type Rule = (input: Parsed) => Failure | null;

const cancel = (reason: RecheckReason): Failure => ({ reason, action: 'cancel' });
const review = (reason: RecheckReason): Failure => ({ reason, action: 'hold_review' });

const r1NotReplied: Rule = (i) => {
  if (i.comment.externalReplyId !== null) return cancel('already_replied');
  if (!RECHECK_SENDABLE_STATUSES[i.mode].includes(i.comment.status))
    return cancel('status_changed');
  return null;
};

const r2NotRemoved: Rule = (i) => {
  if (i.comment.deletedAt !== null) return cancel('comment_deleted');
  if (i.comment.isHidden) return cancel('comment_hidden');
  if (i.comment.mergedIntoId !== null) return cancel('comment_merged');
  return null;
};

const r3ChannelOk: Rule = (i) => {
  if (i.channel.status !== 'connected')
    return { reason: 'channel_disconnected', action: 'channel_error' };
  if (i.channel.sendSuspended) return { reason: 'channel_send_suspended', action: 'channel_error' };
  return null;
};

const r4AutomationStillOn: Rule = (i) => {
  if (i.mode !== 'auto') return null;
  const a = i.automation;
  if (a === null) return review('automation_unknown');
  if (!a.aiEnabled) return review('workspace_ai_off');
  if (a.emergencyStopped) return review('emergency_stopped');
  if (a.aiPaused) return review('ai_paused');
  if (a.level !== 'auto') return review('mode_not_auto');
  return null;
};

const timeKey = (d: Date | null): number | null => (d === null ? null : d.getTime());

/** Một mục ảnh chụp còn khớp khi sản phẩm còn, giá bằng và mốc đồng bộ từ nguồn bằng (so cả `null`). */
type PriceEntry = z.output<typeof priceEntrySchema>;
function snapshotStillMatches(snapshot: PriceEntry, current: readonly PriceEntry[]): boolean {
  const now = current.find((p) => p.productId === snapshot.productId);
  if (now === undefined) return false;
  if (now.priceVnd !== snapshot.priceVnd) return false;
  return timeKey(now.updatedFromSourceAt) === timeKey(snapshot.updatedFromSourceAt);
}

const r5PriceUnchanged: Rule = (i) => {
  const p = i.price;
  const action: RecheckAction = i.mode === 'auto' ? 'hold_review' : 'ask_confirm';
  if (p === null) return i.mode === 'auto' ? { reason: 'price_unknown', action } : null;
  if (!p.hasMoney) return null;
  if (p.snapshot.length === 0) return { reason: 'price_snapshot_missing', action };
  const changed = p.snapshot.some((entry) => !snapshotStillMatches(entry, p.current));
  return changed ? { reason: 'price_changed', action } : null;
};

const r6KbUnchanged: Rule = (i) => {
  if (i.mode !== 'auto') return null;
  const k = i.kb;
  if (k === null) return review('kb_unknown');
  if (k.draftVersion !== k.currentVersion && k.changeAffectsDraft) return review('kb_changed');
  return null;
};

const r7QuotaLeft: Rule = (i) => {
  if (i.mode !== 'auto') return null;
  const q = i.quota;
  if (q === null) return review('quota_unknown');
  if (q.turnsRemaining !== null && q.turnsRemaining <= 0) return review('quota_exhausted');
  if (q.aiCostCapUsd !== null && q.aiCostMonthUsd >= q.aiCostCapUsd)
    return review('cost_cap_reached');
  if (q.dailyCap !== null && q.autoSentToday >= q.dailyCap) return review('daily_cap_reached');
  return null;
};

const r8MessageWindow: Rule = (i) => {
  if (i.target !== 'message') return null;
  const m = i.message;
  if (m === null) return review('message_window_closed');
  const elapsedMs = i.now.getTime() - m.lastInboundAt.getTime();
  if (elapsedMs < -RECHECK_CLOCK_SKEW_MS) return review('message_window_closed');
  const windowMs =
    i.mode === 'human' && m.humanAgent ? HUMAN_AGENT_WINDOW_MS : AUTO_MESSAGE_WINDOW_MS;
  return elapsedMs >= windowMs ? review('message_window_closed') : null;
};

const r9RateLimit: Rule = (i) => {
  if (i.rate === null) return null;
  return i.rate.remaining <= 0 ? { reason: 'rate_limited', action: 'defer' } : null;
};

/** Thứ tự cố định theo `docs/09` §6.1 — không có đường nào đổi. */
const RULES: readonly Rule[] = Object.freeze([
  r1NotReplied,
  r2NotRemoved,
  r3ChannelOk,
  r4AutomationStillOn,
  r5PriceUnchanged,
  r6KbUnchanged,
  r7QuotaLeft,
  r8MessageWindow,
  r9RateLimit,
]);

const UNREADABLE: SendRecheckResult = Object.freeze({
  ok: false,
  rule: 'recheck:input',
  reason: 'input_unreadable',
  action: 'hold_review',
  rulesPassed: 0,
});

/** Kiểm lại ngay trước khi gửi. Nhận `unknown` để mọi đầu vào hỏng đều là "không gửi" thay vì ném. */
export function sendRecheck(raw: unknown): SendRecheckResult {
  const input = readSendRecheckInput(raw);
  if (input === null) return UNREADABLE;
  for (const [index, rule] of RULES.entries()) {
    const failure = rule(input);
    if (failure !== null) {
      return { ok: false, rule: `recheck:R${index + 1}`, ...failure, rulesPassed: index };
    }
  }
  return { ok: true, rule: null, reason: null, action: null, rulesPassed: RECHECK_COUNT };
}
