import type { MaskedText } from '@flow/shared';

/** FR-144: tối đa 5 lượt gần nhất cùng chuỗi, 3 câu hỏi ở bài khác trong 7 ngày. */
export const MAX_THREAD_TURNS = 5;
export const MAX_OTHER_POST_QUESTIONS = 3;
export const OTHER_POST_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/** Một lượt trong chuỗi bình luận (văn bản đã che PII); `shop` = câu shop đã trả lời. */
export type ThreadTurn = { from: 'customer' | 'shop'; text: MaskedText; at: Date };
/** Câu hỏi của cùng khách ở bài khác (đã che PII, ghi rõ bài nào). */
export type OtherPostQuestion = { postId: string; text: MaskedText; at: Date };

export type CustomerContext = { turns: ThreadTurn[]; otherQuestions: OtherPostQuestion[] };

export type SelectContextInput = {
  thread: readonly ThreadTurn[];
  otherPosts: readonly OtherPostQuestion[];
  currentPostId: string;
  now: Date;
};

/**
 * Chọn ngữ cảnh khách (FR-144), hàm thuần: lượt cũ → mới (≤ 5, kể cả câu shop); câu hỏi bài khác mới →
 * cũ (≤ 3, đúng 7 ngày còn tính). Mốc ở tương lai (lệch giờ/dữ liệu xấu) và bài hiện tại bị loại.
 */
export function selectCustomerContext(input: SelectContextInput): CustomerContext {
  const now = input.now.getTime();
  const windowStart = now - OTHER_POST_WINDOW_DAYS * DAY_MS;

  const turns = input.thread
    .filter((turn) => turn.at.getTime() <= now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-MAX_THREAD_TURNS);

  const otherQuestions = input.otherPosts
    .filter(
      (q) =>
        q.postId !== input.currentPostId && q.at.getTime() <= now && q.at.getTime() >= windowStart,
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, MAX_OTHER_POST_QUESTIONS);

  return { turns, otherQuestions };
}
