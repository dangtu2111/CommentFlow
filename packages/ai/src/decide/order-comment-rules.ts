import { extractPii, foldText } from '@flow/shared';
import { z } from 'zod';
import { type ContactSink, maskAndCapture } from '../pii/mask-pipe';

/**
 * Đặt hàng ngay trong bình luận (DA-ORDER-IN-COMMENT, FR-156, US-112, Q-DOC1, `docs/09` §4/§6).
 * Khách chốt đơn công khai (SĐT/địa chỉ) → CODE nhận ra, LƯU khách tiềm năng TRƯỚC khi che (FR-033/FR-082),
 * rồi chỉ đề xuất câu công khai CỐ ĐỊNH không lặp lại thông tin khách và chuyển cuộc trò chuyện sang tin nhắn riêng.
 *
 * - Phát hiện = (SĐT hoặc địa chỉ) VÀ ý đặt (từ khóa hoặc cờ `order_intent` của extract). Chỉ SĐT không ý đặt →
 *   không phải đơn (việc của auto-hide/che PII); chỉ ý đặt không liên hệ → không.
 * - `suggestHide` chỉ là GỢI Ý cho NGƯỜI bấm Ẩn. Module KHÔNG có đường ra lệnh ẩn (không nhận `HideRequester`):
 *   AI/code không bao giờ tự ẩn bình luận (nguyên tắc #3).
 * - Lưu lỗi → `held`: không trả câu công khai (người xử lý, không mất liên hệ), lỗi chỉ mang mã cố định.
 * - Giai đoạn này `autoSendPolicy = 'never'`: câu mẫu do người duyệt; tự gửi chỉ khi nối cổng + `sendRecheck`
 *   (`DA-ORDER-IN-COMMENT-WIRE`).
 */

/** Trần độ dài: quá → không đọc được (chống tốn CPU). */
export const MAX_ORDER_COMMENT_LENGTH = 5000;

export const ORDER_COMMENT_REASONS = ['phone', 'address', 'order_words', 'order_intent'] as const;
export type OrderCommentReason = (typeof ORDER_COMMENT_REASONS)[number];

/** Câu công khai CỐ ĐỊNH (không chữ số, không thông tin khách). Không do AI soạn. */
export const ORDER_RECEIVED_REPLIES = {
  vi: 'Shop đã nhận thông tin đặt hàng của bạn ạ, shop sẽ inbox xác nhận đơn ngay nhé!',
  en: 'We have received your order details and will message you privately to confirm shortly!',
} as const;

const evaluateInputSchema = z.object({
  text: z.string().max(MAX_ORDER_COMMENT_LENGTH),
  /** Cờ `order_intent` khác null của extract (LLM chỉ thấy bản đã che). */
  orderIntent: z.boolean().optional(),
  authorIsPage: z.boolean().optional(),
});

export type OrderInCommentResult = {
  detected: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  /** Tín hiệu thấy được (thứ tự cố định, không trùng). */
  reasons: OrderCommentReason[];
  /** Gợi ý nút Ẩn cho NGƯỜI bấm; không phải lệnh. */
  suggestHide: boolean;
  unreadable: boolean;
};

const CLEAN: OrderInCommentResult = {
  detected: false,
  hasPhone: false,
  hasAddress: false,
  reasons: [],
  suggestHide: false,
  unreadable: false,
};
const UNREADABLE: OrderInCommentResult = { ...CLEAN, unreadable: true };

/** NFKC (chữ số toàn khổ → thường) + bỏ ký tự định dạng (zero-width…). */
function normalizeRaw(text: string): string {
  return text.normalize('NFKC').replace(/\p{Cf}/gu, '');
}

// Từ khóa đặt hàng (đã bỏ dấu); ranh giới từ để "lấyyy" hay "chốt" trong từ khác không khớp.
const ORDER_WORDS = /\b(?:chot|lay|dat|mua|order|ship|giao)\b/;
// Địa chỉ: số nhà đứng trước đơn vị đường/phố/ngõ/hẻm…, hoặc nhãn "địa chỉ"/"đ/c", hoặc ≥ 2 đơn vị hành chính.
const HOUSE_NUMBER_STREET =
  /\b\d{1,4}[a-z]?(?:\/\d{1,4})*,?\s+(?:duong|pho|ngo|hem|ngach|thon|xom)\b/;
const ADDRESS_LABEL = /\b(?:dia chi|d\/c)\b/;
// "quận" chỉ tính khi kèm số ("quận 1"): bỏ dấu thì trùng "quần"; bỏ "tỉnh" vì trùng "tính/tình".
const ADMIN_UNITS = /\b(?:duong|pho|ngo|hem|phuong|huyen|thanh pho|tp|thon|xom|quan(?= \d))\b/g;

function hasAddressPattern(folded: string): boolean {
  if (HOUSE_NUMBER_STREET.test(folded) || ADDRESS_LABEL.test(folded)) return true;
  const units = new Set(folded.match(ADMIN_UNITS) ?? []);
  return units.size >= 2;
}

function hasPhonePattern(normalized: string): boolean {
  return extractPii(normalized).phones.length > 0;
}

function evaluateParsed(parsed: z.output<typeof evaluateInputSchema>): OrderInCommentResult {
  if (parsed.authorIsPage) return CLEAN;
  const normalized = normalizeRaw(parsed.text);
  const folded = foldText(normalized);
  const hasPhone = hasPhonePattern(normalized);
  const hasAddress = hasAddressPattern(folded);
  const orderWords = ORDER_WORDS.test(folded);
  const intentFlag = parsed.orderIntent === true;
  const detected = (hasPhone || hasAddress) && (orderWords || intentFlag);

  const reasons: OrderCommentReason[] = [];
  if (hasPhone) reasons.push('phone');
  if (hasAddress) reasons.push('address');
  if (orderWords) reasons.push('order_words');
  if (intentFlag) reasons.push('order_intent');
  // Chỉ gợi ý ẩn khi liên hệ được lưu thật (SĐT). Địa chỉ chưa có chỗ lưu (`DA-ORDER-IN-COMMENT-DB`) → không gợi ý
  // ẩn để khỏi mất thông tin khách.
  return {
    detected,
    hasPhone,
    hasAddress,
    reasons,
    suggestHide: detected && hasPhone,
    unreadable: false,
  };
}

/** Hàm thuần. Không ném với mọi đầu vào; đầu vào hỏng/quá dài → `unreadable` (không phát hiện, không gợi ý ẩn). */
export function evaluateOrderInComment(raw: unknown): OrderInCommentResult {
  const parsed = evaluateInputSchema.safeParse(raw);
  return parsed.success ? evaluateParsed(parsed.data) : UNREADABLE;
}

const MIN_SHARED_DIGITS = 3;

/**
 * Câu công khai có an toàn (không lặp lại thông tin khách) không? `false` = rò rỉ: có SĐT/email/địa chỉ, hoặc
 * chứa một dãy ≥ 3 chữ số của bình luận gốc (số nhà, mã…). Câu mẫu cố định luôn đạt.
 */
export function checkOrderReplyLeak(reply: string, commentText: string): boolean {
  const normalizedReply = normalizeRaw(reply);
  const contacts = extractPii(normalizedReply);
  if (contacts.phones.length > 0 || contacts.emails.length > 0) return false;
  if (hasAddressPattern(foldText(normalizedReply))) return false;
  const runs = normalizeRaw(commentText).match(new RegExp(`\\d{${MIN_SHARED_DIGITS},}`, 'g')) ?? [];
  return !runs.some((run) => normalizedReply.includes(run));
}

const handleInputSchema = z.object({
  workspaceId: z.string().min(1),
  commentId: z.string().min(1).optional(),
  text: z.string().max(MAX_ORDER_COMMENT_LENGTH),
  lang: z.enum(['vi', 'en', 'other']),
  orderIntent: z.boolean().optional(),
  /** BẮT BUỘC (so id tác giả với Page, không so tên): thiếu = không đọc được → chuyển người (nguyên tắc #5). */
  authorIsPage: z.boolean(),
});

export type OrderInCommentOutcome =
  | { outcome: 'not_order' }
  /** Lưu khách thất bại hoặc đầu vào hỏng: KHÔNG trả câu công khai; chuyển người. */
  | { outcome: 'held'; reason: 'lead_save_failed' | 'unreadable' }
  | {
      outcome: 'redirect_to_dm';
      /** Câu công khai cố định; `null` khi ngôn ngữ khác vi/en (chuyển người, không đoán). */
      reply: string | null;
      /** Văn bản đã che — chỉ bản này được đi tiếp tới LLM/Langfuse. */
      /** `null` khi bình luận có địa chỉ: `maskPii` chưa che địa chỉ (`PII-MASK-ADDRESS`) nên KHÔNG được đi tiếp tới LLM. */
      maskedText: string | null;
      suggestHide: boolean;
      needsHuman: true;
      autoSendPolicy: 'never';
      reasons: OrderCommentReason[];
    };

/**
 * Lưu khách tiềm năng TRƯỚC (`maskAndCapture`), rồi mới trả hướng chuyển sang tin nhắn riêng. Không nhận
 * `HideRequester`: không có đường ẩn. Kết quả không chứa SĐT/địa chỉ gốc.
 */
export async function handleOrderInComment(
  raw: unknown,
  deps: { contactSink: ContactSink },
): Promise<OrderInCommentOutcome> {
  const parsed = handleInputSchema.safeParse(raw);
  if (!parsed.success) return { outcome: 'held', reason: 'unreadable' };
  const input = parsed.data;

  const evaluation = evaluateParsed(input);
  if (!evaluation.detected) return { outcome: 'not_order' };

  const captured = await maskAndCapture(
    { workspaceId: input.workspaceId, sourceId: input.commentId, text: normalizeRaw(input.text) },
    deps.contactSink,
  );
  if (!captured.saved) return { outcome: 'held', reason: 'lead_save_failed' };

  const reply = input.lang === 'other' ? null : ORDER_RECEIVED_REPLIES[input.lang];
  return {
    outcome: 'redirect_to_dm',
    reply,
    // Lưu ý: `maskPii` hiện chỉ che SĐT/email, chưa che địa chỉ (gap `PII-MASK-ADDRESS`, ghi ở bàn giao).
    maskedText: evaluation.hasAddress ? null : captured.masked,
    suggestHide: evaluation.suggestHide,
    needsHuman: true,
    autoSendPolicy: 'never',
    reasons: evaluation.reasons,
  };
}
