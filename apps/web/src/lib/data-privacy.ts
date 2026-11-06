/**
 * Quyền riêng tư dữ liệu workspace (FR-094, US-071). Hiện CHỈ giao diện + interface: xuất dữ liệu/xóa thật chưa có
 * (gap `DATA-EXPORT`, `WORKSPACE-DELETE`). Bước xác nhận xóa: Owner phải gõ đúng tên workspace.
 */
export function isDeletionConfirmed(typed: string, workspaceName: string): boolean {
  const expected = workspaceName.trim().toLowerCase();
  return expected.length > 0 && typed.trim().toLowerCase() === expected;
}

export type DataRequestResult = { ok: true } | { ok: false; reason: 'unavailable' };

/** Cổng tới dịch vụ xuất/xóa dữ liệu. Bản mặc định báo "chưa khả dụng"; bản thật nối ở nhánh sau. */
export interface WorkspaceDataLifecycle {
  requestExport(workspaceId: string): Promise<DataRequestResult>;
  requestDeletion(workspaceId: string): Promise<DataRequestResult>;
}

export const unavailableDataLifecycle: WorkspaceDataLifecycle = {
  requestExport: async () => ({ ok: false, reason: 'unavailable' }),
  requestDeletion: async () => ({ ok: false, reason: 'unavailable' }),
};
