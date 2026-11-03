import type { WorkspaceMembership } from '@flow/saas-core';

/** Cookie ký (khóa HKDF nhãn `workspace-cookie/v1`) chỉ chứa id workspace đã chọn; KHÔNG phải nguồn quyền. */
export const WORKSPACE_COOKIE = 'cf-workspace';
export const WORKSPACE_COOKIE_LABEL = 'workspace-cookie/v1';
export const WORKSPACE_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Chọn workspace đang dùng: id trong cookie chỉ có hiệu lực nếu NGƯỜI DÙNG CÒN là thành viên `active` (danh sách
 * `memberships` do server đọc qua `withUser` mỗi request). Không khớp (bị gỡ, tạm khóa, cookie giả/cũ) → workspace
 * đầu tiên theo tên; không có workspace nào → null.
 */
export function chooseWorkspace(
  memberships: WorkspaceMembership[],
  selectedId: string | null,
): WorkspaceMembership | null {
  if (selectedId) {
    const match = memberships.find((m) => m.id === selectedId);
    if (match) return match;
  }
  return memberships[0] ?? null;
}
