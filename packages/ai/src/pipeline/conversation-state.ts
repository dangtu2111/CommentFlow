import { z } from 'zod';
import type { ExtractResult } from '../classify/extract-result';

/**
 * TRẠNG THÁI HỘI THOẠI CÓ CẤU TRÚC (PIPE-CONVO-CONTEXT, Q-POR12 điểm 6). Cuối mỗi lượt, pipeline ghi lại (vào `drafts.context_refs`)
 * những gì lượt SAU cần để hiểu câu trả lời ngắn của khách: sản phẩm đã nhận ra và các ý khách đang chờ được trả lời (đã hỏi lại
 * size/màu thì "M đen" là câu trả lời, không phải câu mới). Nhờ vậy "hỏi lại" không bị vô hạn: khách trả lời → AI biết sản phẩm và
 * ý hỏi cũ → trả lời ngay. Hàm thuần.
 */
export const conversationStateSchema = z.object({
  /** Sản phẩm đã nhận ra ở lượt trước (id) — dùng khi lượt này khách không nêu tên. */
  productIds: z.array(z.uuid()).max(5),
  /** Ý khách đang chờ (từ `extract.asks` của lượt đã hỏi lại); rỗng khi lượt trước đã trả lời xong. */
  pendingAsks: z.array(z.string().min(1).max(200)).max(8),
});

export type ConversationState = z.infer<typeof conversationStateSchema>;

export const EMPTY_CONVERSATION_STATE: ConversationState = { productIds: [], pendingAsks: [] };

/** Đọc cột jsonb từ DB; hỏng/thiếu → `null` (không đoán, không ném). */
export function parseConversationState(value: unknown): ConversationState | null {
  const parsed = conversationStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Trạng thái để ghi SAU lượt này: sản phẩm đã nhận ra; ý đang chờ chỉ khi lượt này HỎI LẠI (khách sẽ trả lời câu hỏi đó).
 * `asks` rỗng thì lấy nhãn làm ý (vd. hỏi giá không có từ khóa) — không để mất ý chờ.
 */
export function nextConversationState(input: {
  action: 'answer' | 'clarify' | 'redirect' | 'handoff';
  productIds: readonly string[];
  asks: readonly string[];
}): ConversationState {
  return {
    productIds: [...new Set(input.productIds)].slice(0, 5),
    pendingAsks: input.action === 'clarify' ? input.asks.slice(0, 8) : [],
  };
}

/**
 * Lượt này khách chỉ trả lời ngắn ("M đen", extract không có ý hỏi nào) mà lượt trước còn ý đang chờ → thừa hưởng ý đó
 * (nếu không, "M đen" thành câu mơ hồ → hỏi lại lần hai → chuyển người). Có ý hỏi mới thì giữ nguyên ý mới.
 */
export function carryOverAsks<T extends ExtractResult>(
  extract: T,
  state: ConversationState | null,
): T {
  if (!state || state.pendingAsks.length === 0 || extract.asks.length > 0) return extract;
  return { ...extract, asks: [...state.pendingAsks] };
}
