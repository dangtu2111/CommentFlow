'use server';

import { redirect } from 'next/navigation';
import { parseCalendarEdit } from '../../../../lib/calendar-edit-form';
import { isDay } from '../../../../lib/calendar-move';
import { calendarHref } from '../../../../lib/calendar-week';
import { actionAllowed } from '../../../../server/action-guard';
import { loadWorkspaceTimeZone } from '../../../../server/post-calendar';
import type { PublishActionResult } from '../../../../server/publish-posts';
import { publishPostService } from '../../../../server/publish-runtime';
import { requireAppUser } from '../../../../server/require-app-user';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Về Lịch (đúng tuần nếu biết) kèm mã thông báo `n`. */
function go(result: PublishActionResult): never {
  const base = calendarHref(result.week ? { week: result.week } : {});
  redirect(`${base}${base.includes('?') ? '&' : '?'}n=${result.notice}`);
}

/**
 * Kéo thả: Owner kéo một bài ĐÃ LÊN LỊCH sang ngày khác (giữ nguyên giờ địa phương). Id bài và ngày chỉ là lựa chọn: workspace/người dùng lấy từ phiên, DB kiểm lại quyền,
 * trạng thái bài và khoảng giờ. Dùng bộ giới hạn `uiSensitive` vì đổi giờ một bài đã hẹn là thao tác hướng ra ngoài.
 */
export async function movePublishPostAction(postId: string, day: string): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  if (typeof postId !== 'string' || !UUID.test(postId) || typeof day !== 'string' || !isDay(day)) {
    redirect(`${calendarHref({})}?n=invalid`);
  }
  if (!(await actionAllowed('uiSensitive', { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${calendarHref({})}?n=rate_limited`);
  }
  const timeZone = await loadWorkspaceTimeZone(workspace.id, user.id);
  go(
    await publishPostService().move(
      { workspaceId: workspace.id, userId: user.id },
      postId,
      day,
      timeZone,
    ),
  );
}

/** Hộp thoại bài trên Lịch: Owner lưu nội dung và/hoặc giờ của bài nháp/đã lên lịch. Không nhận workspace/người dùng từ form. */
export async function updatePublishPostAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const timeZone = await loadWorkspaceTimeZone(workspace.id, user.id);
  const parsed = parseCalendarEdit(formData, timeZone);
  if (!parsed.ok) redirect(`${calendarHref({})}?n=${parsed.code}`);
  const guard = parsed.value.intent === 'draft' ? 'uiWrite' : 'uiSensitive';
  if (!(await actionAllowed(guard, { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${calendarHref({})}?n=rate_limited`);
  }
  go(
    await publishPostService().edit(
      { workspaceId: workspace.id, userId: user.id },
      parsed.value,
      timeZone,
    ),
  );
}
