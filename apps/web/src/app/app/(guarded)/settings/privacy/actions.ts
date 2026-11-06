'use server';

import { redirect } from 'next/navigation';
import {
  exportNoticeOf,
  isDeletionConfirmed,
  unavailableDataLifecycle,
} from '../../../../../lib/data-privacy';
import { dataExports } from '../../../../../server/data-export';
import { requireAppUser } from '../../../../../server/require-app-user';

const BACK = '/app/settings/privacy';

/**
 * Owner yêu cầu xuất dữ liệu (FR-094). Workspace/người dùng lấy từ phiên (không từ form). Cờ DATA_EXPORT_ENABLED tắt
 * (mặc định) → "chưa mở", không ghi gì; lỗi bất ngờ cũng chỉ báo "chưa mở" (không lộ chi tiết).
 */
export async function requestExportAction(): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  let notice: ReturnType<typeof exportNoticeOf>;
  try {
    notice = exportNoticeOf(
      await dataExports().request({ workspaceId: workspace.id, userId: user.id }),
    );
  } catch {
    notice = 'unavailable';
  }
  redirect(`${BACK}?notice=${notice}`);
}

/**
 * Owner gửi yêu cầu xóa workspace (FR-094, US-071). Workspace lấy từ phiên, KHÔNG từ form; phải gõ đúng tên workspace.
 * Dịch vụ xóa thật chưa mở → báo "chưa mở", KHÔNG xóa gì.
 */
export async function requestDeletionAction(formData: FormData): Promise<void> {
  const { workspace } = await requireAppUser({ role: 'owner' });
  const typed = formData.get('confirm');
  if (typeof typed !== 'string' || !isDeletionConfirmed(typed, workspace.name)) {
    redirect(`${BACK}?notice=mismatch`);
  }
  const result = await unavailableDataLifecycle.requestDeletion(workspace.id);
  redirect(`${BACK}?notice=${result.ok ? 'ok' : result.reason}`);
}
