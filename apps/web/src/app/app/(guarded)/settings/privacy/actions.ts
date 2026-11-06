'use server';

import { redirect } from 'next/navigation';
import { isDeletionConfirmed, unavailableDataLifecycle } from '../../../../../lib/data-privacy';
import { requireAppUser } from '../../../../../server/require-app-user';

const BACK = '/app/settings/privacy';

/** Owner yêu cầu xuất dữ liệu (FR-094). Dịch vụ thật chưa mở → báo "chưa mở", không ghi gì. */
export async function requestExportAction(): Promise<void> {
  const { workspace } = await requireAppUser({ role: 'owner' });
  const result = await unavailableDataLifecycle.requestExport(workspace.id);
  redirect(`${BACK}?notice=${result.ok ? 'ok' : result.reason}`);
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
