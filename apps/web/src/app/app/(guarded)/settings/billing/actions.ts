'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '../../../../../server/db';
import { defaultPaymentDeps, reportTransfer } from '../../../../../server/invoice-payment';
import { requireAppUser } from '../../../../../server/require-app-user';

const BACK = '/app/settings/billing';

/**
 * Owner báo "Tôi đã chuyển khoản" (QR-PAYMENT, FR-091): CHỈ Owner (`requireAppUser({role:'owner'})` → Staff nhận 404).
 * Workspace và người dùng lấy từ phiên server; `invoiceId` từ form chỉ được dùng nếu thuộc workspace (hàm DB kiểm,
 * sai → "không tìm thấy"). Chỉ đánh dấu "chờ xác nhận", KHÔNG đánh dấu đã thanh toán. Kết thúc luôn chuyển hướng về
 * trang kèm mã thông báo cố định (`reported` / `error`).
 */
export async function reportTransferAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const raw = formData.get('invoiceId');
  const invoiceId = typeof raw === 'string' ? raw : '';
  let target = `${BACK}?payment=error`;
  try {
    const outcome = await reportTransfer(
      defaultPaymentDeps(getDb()),
      { workspaceId: workspace.id, userId: user.id },
      invoiceId,
    );
    if (outcome === 'ok' || outcome === 'already_reported') target = `${BACK}?payment=reported`;
  } catch (error) {
    // Chỉ workspace + tên lớp lỗi; không ghi nội dung form.
    console.error('payment.report_failed', {
      workspaceId: workspace.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
  if (target.endsWith('reported')) revalidatePath(BACK);
  redirect(target);
}
