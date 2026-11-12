import { listChannels, loadChannelActivity } from '@flow/db/runtime';
import { evaluateFbPermissions } from '@flow/shared';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { ChannelsHeaderActions, ChannelsHub } from '../../../../components/settings/channels-hub';
import { FbPageSelectModal } from '../../../../components/settings/fb-page-select-modal';
import { SettingsFrame } from '../../../../components/settings/settings-frame';
import { Banner } from '../../../../components/ui/banner';
import {
  canReconnect,
  countParam,
  FB_REREQUEST_PATH,
  FB_SELECT_PATH,
  FB_START_PATH,
  fbNoticeOf,
} from '../../../../lib/fb-connect-view';
import { getAuthRuntime } from '../../../../server/auth';
import { getBrand } from '../../../../server/brand';
import { getDb } from '../../../../server/db';
import { listConnectablePages } from '../../../../server/fb-connect';
import {
  buildChannelStore,
  buildFbOAuthClient,
  getEnabledFbConfig,
} from '../../../../server/fb-connect-runtime';
import { decodeOAuthSession, FB_SESSION_COOKIE } from '../../../../server/fb-oauth-state';
import { requireAppUser } from '../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../server/settings-counts';

export async function generateMetadata() {
  const t = await getTranslations('channels');
  return { title: `${t('title')} · ${getBrand().name}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICE_VARIANT = {
  done: 'success',
  partial: 'warning',
  state: 'danger',
  denied: 'info',
  error: 'danger',
  limit: 'warning',
  none: 'warning',
  unavailable: 'danger',
  expiredSession: 'warning',
} as const;

/** Trang Kênh (chỉ Owner; Staff nhận 404): danh sách kênh, kết nối Facebook, chọn Page, "Kết nối lại" (FR-010/012). */
export default async function ChannelsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('channels'), searchParams]);

  let config: ReturnType<typeof getEnabledFbConfig> = null;
  let misconfigured = false;
  try {
    config = getEnabledFbConfig();
  } catch {
    misconfigured = true; // bật mà thiếu biến: không lộ chi tiết ở giao diện, lỗi đã rõ ở nhật ký khởi động
  }
  const enabled = config !== null;

  const [channels, activity] = await getDb().withActor(
    workspace.id,
    user.id,
    async (tx) =>
      [await listChannels(tx, workspace.id), await loadChannelActivity(tx, workspace.id)] as const,
  );

  // Bước chọn Page: chỉ khi cookie niêm phong còn hạn VÀ đúng người + workspace.
  const wantsSelect = query.fb === 'select';
  let pages: Awaited<ReturnType<typeof listConnectablePages>> | null = null;
  let loadFailed = false;
  // Quyền Meta ĐÃ CẤP cho ứng dụng (token người dùng) — hiện ở bước chọn Page để Owner biết đủ quyền chưa TRƯỚC khi kết nối; null = không đọc được.
  let grantedReport: ReturnType<typeof evaluateFbPermissions> | null = null;
  let granularCounts: Record<string, number> | null = null;
  let tokenValid = false;
  if (config && wantsSelect) {
    const session = decodeOAuthSession(
      getAuthRuntime().fbOAuthSession.open((await cookies()).get(FB_SESSION_COOKIE)?.value),
      { workspaceId: workspace.id, userId: user.id },
    );
    if (session) {
      try {
        const oauth = buildFbOAuthClient(config);
        pages = await listConnectablePages(
          { oauth, store: buildChannelStore(workspace.id, user.id) },
          session.userToken,
        );
        try {
          const tokenInfo = await oauth.debugToken(session.userToken);
          grantedReport = evaluateFbPermissions(tokenInfo.scopes);
          tokenValid = tokenInfo.valid;
          // Số Page được cấp theo từng quyền (chỉ SỐ, không ID): Page không được tick ở hộp thoại Meta thì không xuất hiện ở đây.
          granularCounts = Object.fromEntries(
            tokenInfo.granular.map((entry) => [entry.scope, entry.targetIds.length]),
          );
        } catch {
          grantedReport = null; // hỏi quyền lỗi: không chặn việc chọn Page, chỉ không hiện bảng quyền
        }
        // Chẩn đoán "không thấy Page nào": chỉ SỐ LƯỢNG và TÊN quyền (không token, không tên/ID Page).
        console.info(
          JSON.stringify({
            event: 'fb_select_pages',
            pages: pages.length,
            usable: pages.filter((page) => page.usable).length,
            granted: grantedReport?.granted ?? null,
            missing: grantedReport?.missing ?? null,
            granularPageCounts: granularCounts,
          }),
        );
      } catch (error) {
        loadFailed = true;
        const e = error as { code?: string };
        console.error(
          JSON.stringify({ event: 'fb_select_pages_failed', code: e?.code ?? 'unknown' }),
        );
      }
    }
  }
  const reconnectable = new Set(
    channels
      .filter((channel) =>
        canReconnect({
          role: workspace.role,
          enabled,
          status: channel.status,
          webhookSubscribed: channel.webhookSubscribed,
        }),
      )
      .map((channel) => channel.id),
  );
  const notice = loadFailed
    ? 'error'
    : wantsSelect && pages === null
      ? 'expiredSession'
      : fbNoticeOf(query.fb);

  const actionNotice = (
    [
      'disconnected',
      'lang_saved',
      'check_queued',
      'check_recent',
      'not_found',
      'forbidden',
      'unavailable',
    ] as const
  ).find((code) => code === query.ch);

  const counts = await loadSettingsCounts({
    role: workspace.role,
    workspaceId: workspace.id,
    userId: user.id,
  });

  return (
    <main className="app-page app-page-settings">
      <SettingsFrame
        viewerRole={workspace.role}
        active="channels"
        variant="tabs"
        counts={counts}
        workspaceName={workspace.name}
        headerEnd={<ChannelsHeaderActions connectHref={enabled ? FB_START_PATH : null} />}
      >
        {notice ? (
          <Banner variant={NOTICE_VARIANT[notice]}>
            {t(`notice.${notice}`, { ok: countParam(query.ok), bad: countParam(query.bad) })}
          </Banner>
        ) : null}
        {query.none === '1' && pages ? <Banner variant="warning">{t('notice.none')}</Banner> : null}
        {misconfigured ? <Banner variant="danger">{t('notice.unavailable')}</Banner> : null}

        {pages ? (
          <FbPageSelectModal
            pages={pages}
            used={
              channels.filter((c) => c.platform === 'facebook' && c.status !== 'revoked').length
            }
            limit={config?.channelsLimit ?? 1}
            permissions={
              grantedReport
                ? {
                    sufficient: grantedReport.sufficient,
                    missing: grantedReport.missing,
                    tokenValid,
                  }
                : null
            }
            rerequestHref={FB_REREQUEST_PATH}
            switchAccountHref={FB_START_PATH}
            refreshHref={FB_SELECT_PATH}
          />
        ) : null}

        {actionNotice ? (
          <Banner
            variant={
              actionNotice === 'disconnected' || actionNotice === 'lang_saved'
                ? 'success'
                : 'danger'
            }
          >
            {t(`notice.ch.${actionNotice}`)}
          </Banner>
        ) : null}
        <ChannelsHub
          channels={channels}
          activity={activity}
          reconnectable={reconnectable}
          connectHref={enabled ? FB_START_PATH : null}
        />
      </SettingsFrame>
    </main>
  );
}
