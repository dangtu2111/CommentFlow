'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { automationSettings } from '../../../../server/automation-settings';
import { requireAppUser } from '../../../../server/require-app-user';

const BACK = '/app/automation';

/**
 * Lưu cài đặt tự gửi (FR-070/071): CHỈ Owner (`requireAppUser({role:'owner'})` → Staff nhận 404). Workspace và
 * người dùng lấy từ phiên server, KHÔNG từ form; kênh trong form chỉ được nhận nếu thuộc workspace (kiểm ở
 * dịch vụ). Kết thúc luôn chuyển hướng về trang kèm mã thông báo (`saved` / `error=<trường>` / `unavailable`).
 */
export async function saveAutomationAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  let target: string;
  try {
    const result = await automationSettings().save(
      { workspaceId: workspace.id, userId: user.id },
      formData,
    );
    target = result.ok ? `${BACK}?saved=1` : `${BACK}?error=${result.field}`;
  } catch {
    target = `${BACK}?error=unavailable`;
  }
  if (target.includes('saved')) revalidatePath(BACK);
  redirect(target);
}
