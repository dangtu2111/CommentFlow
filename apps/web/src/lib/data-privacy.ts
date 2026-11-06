/**
 * Quyền riêng tư dữ liệu workspace (FR-094, US-071). Hiện CHỈ giao diện + interface: xuất dữ liệu/xóa thật chưa có
 * (gap `DATA-EXPORT`, `WORKSPACE-DELETE`). Bước xác nhận xóa: Owner phải gõ đúng tên workspace.
 */
export function isDeletionConfirmed(typed: string, workspaceName: string): boolean {
  const expected = workspaceName.trim().toLowerCase();
  return expected.length > 0 && typed.trim().toLowerCase() === expected;
}

export type DataRequestResult = { ok: true } | { ok: false; reason: 'unavailable' };

/** Cổng tới dịch vụ xóa workspace. Bản mặc định báo "chưa khả dụng"; bản thật nối ở `WORKSPACE-DELETE`. Xuất dữ liệu: `server/data-export.ts` (FR-094). */
export interface WorkspaceDataLifecycle {
  requestDeletion(workspaceId: string): Promise<DataRequestResult>;
}

export const unavailableDataLifecycle: WorkspaceDataLifecycle = {
  requestDeletion: async () => ({ ok: false, reason: 'unavailable' }),
};

/** Thông báo hiển thị sau khi gửi form ở trang Quyền riêng tư (khóa `settings.privacy.notices.*`). */
export const PRIVACY_NOTICES = [
  'unavailable',
  'mismatch',
  'export_queued',
  'already_active',
  'rate_limited',
] as const;
export type PrivacyNotice = (typeof PRIVACY_NOTICES)[number];

/** Chọn thông báo cho kết quả yêu cầu xuất dữ liệu (thành công → `export_queued`, lỗi → đúng lý do). */
export function exportNoticeOf(
  result: { ok: true } | { ok: false; reason: 'unavailable' | 'already_active' | 'rate_limited' },
): PrivacyNotice {
  return result.ok ? 'export_queued' : result.reason;
}

/** Chỉ nhận giá trị `notice` nằm trong danh sách (không phản chiếu chuỗi lạ từ URL). */
export function parsePrivacyNotice(value: string | string[] | undefined): PrivacyNotice | null {
  return PRIVACY_NOTICES.find((n) => n === value) ?? null;
}
