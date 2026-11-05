import { listChannels } from '@flow/db/runtime';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Banner } from '../../../../components/ui/banner';
import {
  canReconnect,
  countParam,
  FB_START_PATH,
  fbNoticeOf,
} from '../../../../lib/fb-connect-view';
import { getAuthRuntime } from '../../../../server/auth';
import { getDb } from '../../../../server/db';
import { listConnectablePages } from '../../../../server/fb-connect';
import {
  buildChannelStore,
  buildFbOAuthClient,
  getEnabledFbConfig,
} from '../../../../server/fb-connect-runtime';
import { decodeOAuthSession, FB_SESSION_COOKIE } from '../../../../server/fb-oauth-state';
import { requireAppUser } from '../../../../server/require-app-user';
import { cancelConnectAction, connectPagesAction } from './actions';

export async function generateMetadata() {
  const t = await getTranslations('channels');
  return { title: `${t('title')} · ${(await getTranslations('auth'))('brand')}` };
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

  const channels = await getDb().withActor(workspace.id, user.id, (tx) =>
    listChannels(tx, workspace.id),
  );

  // Bước chọn Page: chỉ khi cookie niêm phong còn hạn VÀ đúng người + workspace.
  const wantsSelect = query.fb === 'select';
  let pages: Awaited<ReturnType<typeof listConnectablePages>> | null = null;
  let loadFailed = false;
  if (config && wantsSelect) {
    const session = decodeOAuthSession(
      getAuthRuntime().fbOAuthSession.open((await cookies()).get(FB_SESSION_COOKIE)?.value),
      { workspaceId: workspace.id, userId: user.id },
    );
    if (session) {
      try {
        pages = await listConnectablePages(
          { oauth: buildFbOAuthClient(config), store: buildChannelStore(workspace.id, user.id) },
          session.userToken,
        );
      } catch {
        loadFailed = true;
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

  return (
    <main className="app-page app-page-wide">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle', { workspace: workspace.name })}</p>

      {notice ? (
        <Banner variant={NOTICE_VARIANT[notice]}>
          {t(`notice.${notice}`, { ok: countParam(query.ok), bad: countParam(query.bad) })}
        </Banner>
      ) : null}
      {query.none === '1' && pages ? <Banner variant="warning">{t('notice.none')}</Banner> : null}
      {misconfigured ? <Banner variant="danger">{t('notice.unavailable')}</Banner> : null}

      {pages ? (
        <section className="card stack" aria-labelledby="pick-title">
          <h2 id="pick-title" className="section-title">
            {t('pick.title')}
          </h2>
          <p className="muted">{t('pick.hint', { limit: config?.channelsLimit ?? 1 })}</p>
          {pages.length === 0 ? <p>{t('pick.empty')}</p> : null}
          <form action={connectPagesAction} className="stack">
            <ul className="member-list">
              {pages.map((page) => (
                <li key={page.id} className="member-item">
                  <label className="member-info">
                    <input type="checkbox" name="page" value={page.id} disabled={!page.usable} />{' '}
                    <span className="member-name">{page.name}</span>
                    {page.connected ? (
                      <span className="badge badge-on">{t('pick.connected')}</span>
                    ) : null}
                    {page.usable ? null : <span className="muted">{t('pick.noPermission')}</span>}
                  </label>
                </li>
              ))}
            </ul>
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={pages.length === 0}>
                {t('pick.submit')}
              </button>
              <button type="submit" formAction={cancelConnectAction} className="btn btn-secondary">
                {t('pick.cancel')}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="channels-title">
        <h2 id="channels-title" className="section-title">
          {t('list.title')}
        </h2>
        {channels.length === 0 ? <p className="muted">{t('list.empty')}</p> : null}
        <ul className="member-list">
          {channels.map((channel) => (
            <li key={channel.id} className="member-item">
              <div className="member-info">
                <p className="member-name">{channel.name}</p>
                <p>
                  <span className="badge badge-off">{t(`platform.${channel.platform}`)}</span>{' '}
                  <span
                    className={
                      channel.status === 'connected' ? 'badge badge-on' : 'badge badge-off'
                    }
                  >
                    {t(`status.${channel.status}`)}
                  </span>{' '}
                  {channel.status === 'connected' && !channel.webhookSubscribed ? (
                    <span className="badge badge-off">{t('list.noWebhook')}</span>
                  ) : null}
                </p>
              </div>
              {reconnectable.has(channel.id) ? (
                <a href={FB_START_PATH} className="btn btn-secondary">
                  {t('reconnect')}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        {enabled ? (
          <a href={FB_START_PATH} className="btn btn-primary">
            {t('connect')}
          </a>
        ) : (
          <p className="muted">{t('disabled')}</p>
        )}
      </section>
    </main>
  );
}
