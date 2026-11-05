/**
 * Thẻ 2FA hiện luồng BẬT (không phải luồng quản lý) khi chưa bật, HOẶC khi đang trong phiên bật: sau khi xác nhận
 * mã đầu tiên, máy chủ dựng lại trang với `enabled = true`, nhưng người dùng vẫn phải thấy mã dự phòng một lần
 * cho đến khi bấm "Đã lưu" (nếu không mã dự phòng biến mất cùng luồng bật).
 */
export function showEnableFlow(input: { enabled: boolean; enrolling: boolean }): boolean {
  return !input.enabled || input.enrolling;
}
