'use server';

import { redirect } from 'next/navigation';
import { calendarHref } from '../../../../lib/calendar-week';
import { parsePublishForm } from '../../../../lib/publish-form';
import type { PublishOutcome } from '../../../../lib/publish-outcome';
import { actionAllowed } from '../../../../server/action-guard';
import { loadPublishOutcome, loadWorkspaceTimeZone } from '../../../../server/post-calendar';
import type { PublishActionResult } from '../../../../server/publish-posts';
import { publishPostService } from '../../../../server/publish-runtime';
import { requireAppUser } from '../../../../server/require-app-user';

const COMPOSER = '/app/composer';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chuyển hướng theo kết quả: về Biên tập (kèm `id` bài để sửa tiếp) hoặc Lịch (kèm tuần); luôn mang mã thông báo `n`. */
function go(result: PublishActionResult): never {
  const notice = `n=${result.notice}`;
  if (result.to === 'calendar') {
    const base = calendarHref(result.week ? { week: result.week } : {});
    // "Đăng ngay": Lịch theo dõi bài (`watch`) rồi báo thành công/thất bại khi worker có kết quả.
    const watch = result.notice === 'publishing' && result.postId ? `&watch=${result.postId}` : '';
    redirect(`${base}${base.includes('?') ? '&' : '?'}${notice}${watch}`);
  }
  redirect(`${COMPOSER}?${result.postId ? `id=${result.postId}&` : ''}${notice}`);
}

/**
 * Owner lưu nháp / lên lịch / đăng ngay (POST-PUBLISHING, Q-PUB1). KHÔNG nhận workspace/người dùng từ form: lấy từ `requireAppUser({ role: 'owner' })`. Giờ lên lịch nhập theo MÚI GIỜ của cửa hàng.
 * Lên lịch/đăng ngay là hành động hướng ra ngoài nên dùng bộ giới hạn `uiSensitive`; lưu nháp dùng `uiWrite`. Cờ `FB_PUBLISH_ENABLED` tắt → chỉ lưu nháp được.
 */
export async function savePublishPostAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const timeZone = await loadWorkspaceTimeZone(workspace.id, user.id);
  const parsed = parsePublishForm(formData, timeZone);
  if (!parsed.ok) redirect(`${COMPOSER}?n=${parsed.code}`);
  const guard = parsed.value.intent === 'draft' ? 'uiWrite' : 'uiSensitive';
  if (!(await actionAllowed(guard, { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${COMPOSER}?${parsed.value.id ? `id=${parsed.value.id}&` : ''}n=rate_limited`);
  }
  go(
    await publishPostService().submit(
      { workspaceId: workspace.id, userId: user.id },
      parsed.value,
      timeZone,
    ),
  );
}

function postIdOf(formData: FormData): string {
  const id = formData.get('postId');
  if (typeof id !== 'string' || !UUID.test(id)) redirect(calendarHref({}));
  return id;
}

/** Owner hủy lịch một bài (`scheduled` → nháp, về Biên tập để sửa). Id bài từ form chỉ là lựa chọn; DB kiểm bài thuộc workspace của Owner. */
export async function cancelPublishScheduleAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = postIdOf(formData);
  if (!(await actionAllowed('uiSensitive', { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${calendarHref({})}?n=rate_limited`);
  }
  go(await publishPostService().cancelSchedule({ workspaceId: workspace.id, userId: user.id }, id));
}

/** Owner xóa một bài nháp/lỗi/đăng một phần (không xóa bài đang chờ/đang đăng/đã đăng thành công). */
export async function deletePublishPostAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = postIdOf(formData);
  if (!(await actionAllowed('uiSensitive', { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${calendarHref({})}?n=rate_limited`);
  }
  go(await publishPostService().remove({ workspaceId: workspace.id, userId: user.id }, id));
}

/** Lịch hỏi kết quả đăng của một bài vừa "Đăng ngay" (chỉ ĐỌC, chỉ Owner). Không thấy bài → coi như chưa có kết quả. */
export async function checkPublishOutcomeAction(postId: string): Promise<PublishOutcome> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  if (typeof postId !== 'string' || !UUID.test(postId)) return { state: 'pending' };
  return (await loadPublishOutcome(workspace.id, user.id, postId)) ?? { state: 'pending' };
}
