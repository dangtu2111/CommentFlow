'use server';

import { clearChannelToken, listChannels, setChannelReplyLanguage } from '@flow/db/runtime';
import { CHANNEL_CHECK_QUEUE } from '@flow/shared';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isCheckThrottled } from '../../../../lib/channel-check';
import { connectSummaryQuery } from '../../../../lib/fb-connect-view';
import { getAuthRuntime } from '../../../../server/auth';
import { createDisconnectChannelAction } from '../../../../server/channel-disconnect';
import { getDb } from '../../../../server/db';
import { connectFacebookPages, FbConnectError } from '../../../../server/fb-connect';
import { buildConnectDeps, getEnabledFbConfig } from '../../../../server/fb-connect-runtime';
import {
  decodeOAuthSession,
  FB_SESSION_COOKIE,
  FB_SESSION_COOKIE_PATH,
} from '../../../../server/fb-oauth-state';
import { enqueueJob } from '../../../../server/queue';
import { createReplyLanguageAction } from '../../../../server/reply-language';
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

const disconnectChannel = createDisconnectChannelAction({
  clear: (session, channelId) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) =>
      clearChannelToken(tx, channelId),
    ),
  warn: (event) => console.error(JSON.stringify(event)),
});

/**
 * Owner ngắt kết nối một kênh: xóa token + đặt `revoked` (hàm DB `cf.clear_channel_token`, ghi nhật ký
 * `channel.token_cleared`). Workspace/người dùng lấy từ `requireAppUser`, KHÔNG từ form. Luôn chuyển hướng về trang
 * Kênh kèm mã thông báo `ch`.
 */
export async function disconnectChannelAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const result = await disconnectChannel(
    { workspaceId: workspace.id, userId: user.id },
    formData.get('channelId'),
  );
  redirect(`${BACK}?ch=${result.ok ? 'disconnected' : result.reason}`);
}

const replyLanguage = createReplyLanguageAction({
  update: (session, channelId, language) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) =>
      setChannelReplyLanguage(tx, session.workspaceId, channelId, language),
    ),
  warn: (event) => console.error(JSON.stringify(event)),
});

/** Owner đổi ngôn ngữ trả lời của một kênh ngay từ hộp "Cài đặt nâng cao" (FR-120); cùng quy tắc với trang Cài đặt. */
export async function setChannelLanguageAction(formData: FormData): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const result = await replyLanguage(
    { workspaceId: workspace.id, userId: user.id },
    formData.get('channelId'),
    formData.get('language'),
  );
  redirect(
    `${BACK}?ch=${result.ok ? 'lang_saved' : result.reason === 'not_found' ? 'not_found' : 'unavailable'}`,
  );
}

/**
 * Owner bấm "Kiểm tra toàn bộ kết nối": đẩy MỘT job `channel-check` cho workspace của mình (worker gọi nền tảng bằng token
 * Page rồi ghi kết quả từng kênh). Workspace lấy từ `requireAppUser`, KHÔNG từ form. Chặn bấm dồn trong
 * `CHECK_COOLDOWN_SECONDS`. Kết quả hiện ở trang Kênh sau khi worker xử lý xong.
 */
export async function checkConnectionsAction(): Promise<void> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const channels = await getDb().withActor(workspace.id, user.id, (tx) =>
    listChannels(tx, workspace.id),
  );
  if (isCheckThrottled(channels, new Date())) redirect(`${BACK}?ch=check_recent`);
  try {
    await enqueueJob(CHANNEL_CHECK_QUEUE, { workspaceId: workspace.id });
  } catch {
    console.error(JSON.stringify({ event: 'channel_check_enqueue_failed' }));
    redirect(`${BACK}?ch=unavailable`);
  }
  redirect(`${BACK}?ch=check_queued`);
}
