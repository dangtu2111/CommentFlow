'use server';

import { redirect } from 'next/navigation';
import { calendarHref } from '../../../../lib/calendar-week';
import { parsePublishForm } from '../../../../lib/publish-form';
import { isSuccessNotice, type SaveState } from '../../../../lib/publish-notice';
import type { PublishOutcome } from '../../../../lib/publish-outcome';
import { actionAllowed } from '../../../../server/action-guard';
import { suggestForWorkspace } from '../../../../server/caption-runtime';
import type { CaptionKind, SuggestionResult } from '../../../../server/caption-service';
import { loadPublishOutcome, loadWorkspaceTimeZone } from '../../../../server/post-calendar';
import type { PublishActionResult } from '../../../../server/publish-posts';
import { publishPostService } from '../../../../server/publish-runtime';
import { requireAppUser } from '../../../../server/require-app-user';

const COMPOSER = '/app/composer';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chuyển hướng theo kết quả: về Biên tập (kèm `id` bài để sửa tiếp) hoặc Lịch (kèm tuần); luôn mang mã thông báo `n`. */
function go(result: PublishActionResult): SaveState {
  const notice = `n=${result.notice}`;
  if (result.to === 'calendar' && isSuccessNotice(result.notice)) {
    const base = calendarHref(result.week ? { week: result.week } : {});
    // "Đăng ngay": Lịch theo dõi bài (`watch`) rồi báo thành công/thất bại khi worker có kết quả.
    const watch = result.notice === 'publishing' && result.postId ? `&watch=${result.postId}` : '';
    redirect(`${base}${base.includes('?') ? '&' : '?'}${notice}${watch}`);
  }
  // Lỗi/cảnh báo ở Biên tập: KHÔNG chuyển trang (chuyển là mất nội dung đang soạn) — trả về để biểu mẫu hiện thông báo và giữ nguyên dữ liệu.
  if (!isSuccessNotice(result.notice)) {
    return { notice: result.notice, ...(result.postId ? { postId: result.postId } : {}) };
  }
  redirect(`${COMPOSER}?${result.postId ? `id=${result.postId}&` : ''}${notice}`);
}

/**
 * Owner lưu nháp / lên lịch / đăng ngay (POST-PUBLISHING, Q-PUB1). KHÔNG nhận workspace/người dùng từ form: lấy từ `requireAppUser({ role: 'owner' })`. Giờ lên lịch nhập theo MÚI GIỜ của cửa hàng.
 * Lên lịch/đăng ngay là hành động hướng ra ngoài nên dùng bộ giới hạn `uiSensitive`; lưu nháp dùng `uiWrite`. Cờ `FB_PUBLISH_ENABLED` tắt → chỉ lưu nháp được.
 */
export async function savePublishPostAction(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const timeZone = await loadWorkspaceTimeZone(workspace.id, user.id);
  const parsed = parsePublishForm(formData, timeZone);
  if (!parsed.ok) return { notice: parsed.code };
  const guard = parsed.value.intent === 'draft' ? 'uiWrite' : 'uiSensitive';
  if (!(await actionAllowed(guard, { userId: user.id, workspaceId: workspace.id }))) {
    return { notice: 'rate_limited', ...(parsed.value.id ? { postId: parsed.value.id } : {}) };
  }
  return go(
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

const MAX_DRAFT_CHARS = 4000;

/**
 * Owner xin AI GỢI Ý caption/hashtag từ nội dung đang soạn (không lưu, không đăng; người dùng tự quyết). Workspace lấy từ phiên, không từ form.
 * Dùng bộ giới hạn `uiSensitive` (1 lần/2 giây, 10 lần/10 phút mỗi người) vì mỗi lần là một lệnh gọi LLM tốn tiền; quá giới hạn → `rate_limited` (thông báo riêng, không nhầm với lỗi dịch vụ).
 */
export async function suggestCaptionAction(
  kind: CaptionKind,
  draft: string,
): Promise<SuggestionResult> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  if ((kind !== 'caption' && kind !== 'hashtags') || typeof draft !== 'string') {
    return { ok: false, reason: 'empty_input' };
  }
  if (!(await actionAllowed('uiSensitive', { userId: user.id, workspaceId: workspace.id }))) {
    return { ok: false, reason: 'rate_limited' };
  }
  return suggestForWorkspace(workspace.id, kind, draft.slice(0, MAX_DRAFT_CHARS));
}
