/**
 * Bộ nhãn ý định chuẩn của bình luận (docs/05 FR-145, docs/07). Khóa ổn định, không phụ thuộc ngôn ngữ; giao diện dịch
 * theo `comments.labels.<khóa>`. Dùng cho "Đổi nhãn" thủ công (FR-045); bộ phân loại về sau ghi cùng bộ khóa này.
 */
export const COMMENT_LABELS = [
  'price',
  'advice',
  'purchase',
  'complaint',
  'spam',
  'other',
] as const;

export type CommentLabel = (typeof COMMENT_LABELS)[number];

export function isCommentLabel(value: unknown): value is CommentLabel {
  return typeof value === 'string' && (COMMENT_LABELS as readonly string[]).includes(value);
}
