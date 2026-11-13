/**
 * Kết quả đăng của MỘT bài (POST-PUBLISHING) để Lịch báo thành công/thất bại sau khi Owner bấm "Đăng ngay". THUẦN, nhận trạng thái các mục tiêu đã đọc từ DB.
 * Ưu tiên an toàn: còn mục tiêu chưa xong → chờ; có mục tiêu "không rõ" → báo không rõ (không bao giờ nói thành công/thất bại khi chưa chắc).
 */
export type OutcomeTarget = { status: string; errorCode: string | null };
export type PublishOutcome =
  | { state: 'pending' }
  | { state: 'published' }
  | { state: 'failed'; errorCode: string | null }
  | { state: 'unknown'; errorCode: string | null };

export function outcomeOf(targets: readonly OutcomeTarget[]): PublishOutcome {
  if (targets.length === 0) return { state: 'pending' };
  if (targets.some((t) => t.status === 'pending' || t.status === 'publishing')) {
    return { state: 'pending' };
  }
  const unknown = targets.find((t) => t.status === 'unknown');
  if (unknown) return { state: 'unknown', errorCode: unknown.errorCode };
  const failed = targets.find((t) => t.status === 'failed');
  if (failed) return { state: 'failed', errorCode: failed.errorCode };
  return { state: 'published' };
}
