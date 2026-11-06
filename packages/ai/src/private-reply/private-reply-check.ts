import { z } from 'zod';
import { RECHECK_CLOCK_SKEW_MS, type RecheckAction } from '../recheck/send-recheck';

/**
 * Kiểm tra trước khi nhắn riêng từ bình luận (private reply, FR-046, BR-15; họ hàng của `sendRecheck` docs/09 §6.1).
 * Luật Meta (docs/12 §1): Facebook cho phép ĐÚNG 1 tin nhắn riêng cho mỗi bình luận, trong ≤ 7 ngày kể từ lúc bình luận;
 * Instagram/TikTok chưa khai báo → chặn. Giá trị khớp `DECLARED_CAPABILITIES.facebook.privateReply` (@flow/connectors).
 *
 * Hàm thuần: nhận dữ liệu ĐÃ ĐO do nơi gọi đọc trong cùng giao dịch khóa dòng bình luận (chống hai người bấm cùng lúc),
 * không gọi DB/mạng. Kiểm P1–P8 đúng thứ tự; trượt → `rule = private_reply:P#` + mã lý do + nhãn tiếng Việt để giao diện
 * hiển thị "Không gửi vì…". Đầu vào hỏng → chặn, không ném. Không có đường ra lệnh ẩn hay gửi.
 *
 * Q-PRP1: AI không tự gửi nhắn riêng — chỉ `mode = human`.
 */

const HOUR = 3_600_000;
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * HOUR;
/** Giới hạn văn bản Messenger (đếm điểm mã Unicode). */
export const PRIVATE_REPLY_MAX_TEXT_LENGTH = 2000;
export const PRIVATE_REPLY_RULE_COUNT = 8;
const SUPPORTED_PLATFORM = 'facebook';

export const PRIVATE_REPLY_REASONS = [
  'input_unreadable',
  'platform_unsupported', // P1
  'already_sent', // P2
  'comment_deleted', // P3
  'comment_merged',
  'comment_hidden',
  'channel_disconnected', // P4
  'channel_send_suspended',
  'window_expired', // P5
  'auto_not_allowed', // P6
  'text_empty', // P7
  'text_too_long',
  'rate_limited', // P8
] as const;
export type PrivateReplyReason = (typeof PRIVATE_REPLY_REASONS)[number];

export const PRIVATE_REPLY_REASON_LABELS: Readonly<Record<PrivateReplyReason, string>> =
  Object.freeze({
    input_unreadable: 'Không đọc được dữ liệu để kiểm tra',
    platform_unsupported: 'Nền tảng này chưa hỗ trợ nhắn riêng từ bình luận',
    already_sent: 'Đã nhắn riêng cho bình luận này (chỉ được 1 tin)',
    comment_deleted: 'Bình luận đã bị xóa',
    comment_merged: 'Bình luận đã được gộp vào bình luận khác',
    comment_hidden: 'Bình luận đã bị ẩn',
    channel_disconnected: 'Kênh mất kết nối',
    channel_send_suspended: 'Kênh đang bị tạm khóa gửi',
    window_expired: 'Đã quá 7 ngày kể từ lúc bình luận, không nhắn riêng được nữa',
    auto_not_allowed: 'AI không tự nhắn riêng; cần nhân viên bấm Gửi',
    text_empty: 'Nội dung tin nhắn đang trống',
    text_too_long: 'Nội dung tin nhắn quá dài',
    rate_limited: 'Hết hạn mức tốc độ gửi theo Page, sẽ thử lại sau',
  });

const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => Number.isFinite(d.getTime()), 'Thời điểm không hợp lệ');

export const privateReplyInputSchema = z.object({
  /** `facebook` | `instagram` | `tiktok`… — chuỗi lạ cũng hợp lệ nhưng bị chặn ở P1. */
  platform: z.string().min(1),
  /** `human` = nhân viên bấm Gửi; `auto` = AI tự gửi (luôn bị chặn, Q-PRP1). */
  mode: z.enum(['human', 'auto']),
  now: instant,
  comment: z.object({
    /** Thời điểm bình luận được đăng (mốc tính 7 ngày). */
    createdAt: instant,
    deletedAt: instant.nullable(),
    isHidden: z.boolean(),
    mergedIntoId: z.string().nullable(),
    /** Đã có tin nhắn riêng cho bình luận này (kể cả đang gửi) → `null` nếu chưa. */
    privateReplySentAt: instant.nullable(),
  }),
  channel: z.object({
    status: z.string().min(1),
    /** `send_suspended_until > now()` — do nơi gọi tính. */
    sendSuspended: z.boolean(),
  }),
  text: z.string(),
  /** Lượt còn lại của hạn mức tốc độ theo Page; `null` = chưa có bộ giới hạn → qua. */
  rate: z.object({ remaining: z.number().int().min(0) }).nullable(),
});
export type PrivateReplyInput = z.input<typeof privateReplyInputSchema>;
type Parsed = z.output<typeof privateReplyInputSchema>;

export type PrivateReplyResult =
  | { ok: true; rulesPassed: number }
  | {
      ok: false;
      /** `private_reply:P1`…`P8`, hoặc `private_reply:input` khi đầu vào hỏng. */
      rule: string;
      reason: PrivateReplyReason;
      action: RecheckAction;
      /** Nhãn tiếng Việt cho giao diện. */
      label: string;
      rulesPassed: number;
    };

type Failure = { reason: PrivateReplyReason; action: RecheckAction };
type Rule = (input: Parsed) => Failure | null;

const cancel = (reason: PrivateReplyReason): Failure => ({ reason, action: 'cancel' });
const textLength = (text: string): number => [...text].length;

const p1Platform: Rule = (i) =>
  i.platform === SUPPORTED_PLATFORM ? null : cancel('platform_unsupported');

const p2OnlyOnce: Rule = (i) =>
  i.comment.privateReplySentAt === null ? null : cancel('already_sent');

const p3CommentAlive: Rule = (i) => {
  if (i.comment.deletedAt !== null) return cancel('comment_deleted');
  if (i.comment.mergedIntoId !== null) return cancel('comment_merged');
  if (i.comment.isHidden) return cancel('comment_hidden');
  return null;
};

const p4ChannelOk: Rule = (i) => {
  if (i.channel.status !== 'connected')
    return { reason: 'channel_disconnected', action: 'channel_error' };
  if (i.channel.sendSuspended) return { reason: 'channel_send_suspended', action: 'channel_error' };
  return null;
};

const p5Window: Rule = (i) => {
  const elapsedMs = i.now.getTime() - i.comment.createdAt.getTime();
  if (elapsedMs < -RECHECK_CLOCK_SKEW_MS) return cancel('window_expired');
  // Mốc ở tương lai trong ngưỡng lệch đồng hồ coi như 0 (giống `evaluateAction`).
  return Math.max(0, elapsedMs) > PRIVATE_REPLY_WINDOW_MS ? cancel('window_expired') : null;
};

const p6HumanOnly: Rule = (i) => (i.mode === 'human' ? null : cancel('auto_not_allowed'));

const p7Text: Rule = (i) => {
  if (i.text.replace(/[​-‍⁠﻿]/g, '').trim().length === 0)
    return { reason: 'text_empty', action: 'ask_confirm' };
  if (textLength(i.text) > PRIVATE_REPLY_MAX_TEXT_LENGTH)
    return { reason: 'text_too_long', action: 'ask_confirm' };
  return null;
};

const p8Rate: Rule = (i) =>
  i.rate !== null && i.rate.remaining <= 0 ? { reason: 'rate_limited', action: 'defer' } : null;

/** Thứ tự cố định — không có đường nào đổi. */
const RULES: readonly Rule[] = Object.freeze([
  p1Platform,
  p2OnlyOnce,
  p3CommentAlive,
  p4ChannelOk,
  p5Window,
  p6HumanOnly,
  p7Text,
  p8Rate,
]);

const UNREADABLE: PrivateReplyResult = Object.freeze({
  ok: false,
  rule: 'private_reply:input',
  reason: 'input_unreadable',
  action: 'hold_review',
  label: PRIVATE_REPLY_REASON_LABELS.input_unreadable,
  rulesPassed: 0,
});

/** Kiểm tra trước khi nhắn riêng. Nhận `unknown`: đầu vào hỏng → chặn thay vì ném. */
export function privateReplyCheck(raw: unknown): PrivateReplyResult {
  const parsed = privateReplyInputSchema.safeParse(raw);
  if (!parsed.success) return UNREADABLE;
  for (const [index, rule] of RULES.entries()) {
    const failure = rule(parsed.data);
    if (failure !== null) {
      return {
        ok: false,
        rule: `private_reply:P${index + 1}`,
        ...failure,
        label: PRIVATE_REPLY_REASON_LABELS[failure.reason],
        rulesPassed: index,
      };
    }
  }
  return { ok: true, rulesPassed: PRIVATE_REPLY_RULE_COUNT };
}

/** Hạn chót nhắn riêng (để giao diện hiện đếm ngược); thời điểm hỏng → `null`. */
export function privateReplyDeadline(commentCreatedAt: string | Date): Date | null {
  const parsed = instant.safeParse(commentCreatedAt);
  return parsed.success ? new Date(parsed.data.getTime() + PRIVATE_REPLY_WINDOW_MS) : null;
}
