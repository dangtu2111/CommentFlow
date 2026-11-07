'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { automationSettings } from '../../../../server/automation-settings';
import { createReplyCapService } from '../../../../server/reply-cap-settings';
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
  } catch (error) {
    // Chỉ mã cố định + workspace + tên lớp lỗi; không ghi nội dung form/chữ ký.
    console.error('automation.save_failed', {
      workspaceId: workspace.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    target = `${BACK}?error=unavailable`;
  }
  if (target.includes('saved')) revalidatePath(BACK);
  redirect(target);
}

/**
 * Lưu trần câu AI cho mỗi khách dưới mỗi bài trong 24 giờ (FR-167, Q-POR14): CHỈ Owner (Staff nhận 404). Giá trị 1–5 kiểm ở máy chủ rồi
 * ở DB (CHECK + RLS Owner). Luôn chuyển hướng về trang kèm mã (`capSaved=1` / `capError=1`).
 */
export async function saveReplyCapAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  let target: string;
  try {
    const result = await createReplyCapService().save(
      { workspaceId: workspace.id, userId: user.id },
      formData.get('maxAiReplies'),
    );
    target = result.ok ? `${BACK}?capSaved=1#reply-cap` : `${BACK}?capError=1#reply-cap`;
  } catch (error) {
    console.error('automation.reply_cap_save_failed', {
      workspaceId: workspace.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    target = `${BACK}?capError=1#reply-cap`;
  }
  if (target.includes('capSaved')) revalidatePath(BACK);
  redirect(target);
}
