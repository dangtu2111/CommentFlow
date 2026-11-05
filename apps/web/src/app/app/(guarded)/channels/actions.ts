'use server';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { connectSummaryQuery } from '../../../../lib/fb-connect-view';
import { getAuthRuntime } from '../../../../server/auth';
import { connectFacebookPages, FbConnectError } from '../../../../server/fb-connect';
import { buildConnectDeps, getEnabledFbConfig } from '../../../../server/fb-connect-runtime';
import {
  decodeOAuthSession,
  FB_SESSION_COOKIE,
  FB_SESSION_COOKIE_PATH,
} from '../../../../server/fb-oauth-state';
import { requireAppUser } from '../../../../server/require-app-user';

const BACK = '/app/channels';

/**
 * Owner chọn Page để kết nối. KHÔNG nhận workspace/người dùng/token từ form: workspace + người dùng lấy từ
 * `requireAppUser`, token người dùng lấy từ cookie NIÊM PHONG (gắn đúng người + workspace), danh sách Page được đọc lại
 * từ Meta — id Page từ form chỉ là lựa chọn, không tự cấp quyền (`connectFacebookPages` kiểm lại).
 * Mọi kết thúc đều chuyển hướng về trang Kênh kèm mã thông báo; cookie token bị xóa khi đã xử lý xong.
 */
export async function connectPagesAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const config = getEnabledFbConfig();
  if (!config) notFound();

  const jar = await cookies();
  const session = decodeOAuthSession(
    getAuthRuntime().fbOAuthSession.open(jar.get(FB_SESSION_COOKIE)?.value),
    { workspaceId: workspace.id, userId: user.id },
  );
  if (!session) redirect(`${BACK}?fb=expiredSession`);

  const selected = formData
    .getAll('page')
    .filter((value): value is string => typeof value === 'string' && /^[0-9]{1,30}$/.test(value))
    .slice(0, 50);

  let query: string;
  try {
    const results = await connectFacebookPages(
      { workspaceId: workspace.id, userToken: session.userToken, selectedPageIds: selected },
      buildConnectDeps(config, { workspaceId: workspace.id, userId: user.id }),
    );
    query = connectSummaryQuery(results);
  } catch (error) {
    if (error instanceof FbConnectError) {
      // Chọn lại được (cookie còn): chưa chọn gì → quay lại bước chọn.
      if (error.code === 'no_selection') redirect(`${BACK}?fb=select&none=1`);
      query = error.code === 'limit_exceeded' ? 'fb=limit' : 'fb=error';
    } else {
      const e = error as { code?: string };
      console.error(JSON.stringify({ event: 'fb_connect_failed', code: e?.code ?? 'unknown' }));
      query = 'fb=error';
    }
  }
  jar.delete({ name: FB_SESSION_COOKIE, path: FB_SESSION_COOKIE_PATH });
  redirect(`${BACK}?${query}`);
}

/** Bỏ phiên chọn Page đang dở (xóa cookie token) rồi về trang Kênh. */
export async function cancelConnectAction(): Promise<void> {
  await requireAppUser({ role: 'owner' });
  (await cookies()).delete({ name: FB_SESSION_COOKIE, path: FB_SESSION_COOKIE_PATH });
  redirect(BACK);
}
