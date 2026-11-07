import type { ChannelActivity, ChannelListItem } from '@flow/db/runtime';
import { REPLY_LANGUAGES } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  checkConnectionsAction,
  disconnectChannelAction,
  setChannelLanguageAction,
} from '../../app/app/(guarded)/channels/actions';
import { cn } from '../../lib/cn';
import { Icon, type IconName } from '../ui/icon';
import { TwDialog, TwDialogTrigger, TwSubmit } from './tw/dialog';
import { TwChip, TwSoonButton, twBtn } from './tw/ui';

/**
 * Cài đặt → Kênh đã kết nối dựng theo `design/stitch/settings-channels.{png,html}`: thẻ số liệu, cảnh báo kênh mất kết
 * nối, nhóm theo nền tảng (Facebook / Instagram / TikTok), chân trang chính sách. Chỉ dùng dữ liệu THẬT của kênh
 * (tên, nền tảng, trạng thái, webhook, ngôn ngữ trả lời); số liệu thiết kế chưa có nguồn (tương tác hôm nay, tỉ lệ AI,
 * ID Page, "Spark AI Bot v2.4"…) hiển thị "—" + "Sắp có", không bịa. Nút chưa có chức năng là `TwSoonButton` (vô hiệu).
 */

const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_ICON: Record<Platform, IconName> = {
  facebook: 'public',
  instagram: 'photo_camera',
  tiktok: 'music_note',
};
const PLATFORM_TINT: Record<Platform, string> = {
  facebook: 'bg-[#1877F2] text-white',
  instagram: 'bg-[#C13584] text-white',
  tiktok: 'bg-[#111] text-white',
};

export type ChannelsHubProps = {
  channels: ChannelListItem[];
  /** Số liệu thật từ `cf.comments`/`cf.messages` (đọc trong `withActor`). */
  activity: ChannelActivity;
  /** Id các kênh có thể "Kết nối lại" (đã kiểm vai trò + cờ bật + trạng thái ở trang). */
  reconnectable: ReadonlySet<string>;
  /** Đường dẫn bắt đầu OAuth Facebook; null khi tính năng đang tắt. */
  connectHref: string | null;
};

/** Hai nút bên phải đầu trang: "Kiểm tra toàn bộ kết nối" (sắp có) và "Thêm kênh mới". */
export async function ChannelsHeaderActions({ connectHref }: { connectHref: string | null }) {
  const t = await getTranslations('channels');
  return (
    <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
      <form action={checkConnectionsAction}>
        <TwSubmit tone="soft">
          <Icon name="sync" size={16} />
          {t('hub.checkAll')}
        </TwSubmit>
      </form>
      {connectHref ? (
        <a href={connectHref} className={twBtn({ tone: 'primary' })}>
          <Icon name="add_link" size={16} />
          {t('hub.addChannel')}
        </a>
      ) : (
        <TwSoonButton tone="primary" soon={t('hub.disabled')}>
          <Icon name="add_link" size={16} />
          {t('hub.addChannel')}
        </TwSoonButton>
      )}
    </div>
  );
}

/** Khóa dịch cho kết quả kiểm gần nhất của kênh. */
const CHECK_LABEL = {
  ok: 'hub.row.checkOk',
  webhook_missing: 'hub.row.checkWebhookMissing',
  token_invalid: 'hub.row.checkTokenInvalid',
  error: 'hub.row.checkError',
  unavailable: 'hub.row.checkUnavailable',
} as const;

const CARD =
  'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-sm';

export async function ChannelsHub({
  channels,
  activity,
  reconnectable,
  connectHref,
}: ChannelsHubProps) {
  const t = await getTranslations('channels');
  const locale = await getLocale();
  const { totals } = activity;
  const interactions = totals.comments24h + totals.messages24h;
  const aiPercent =
    totals.comments7d === 0 ? null : Math.round((totals.autoReplied7d / totals.comments7d) * 100);
  const total = channels.length;
  const connected = channels.filter((channel) => channel.status === 'connected').length;
  const broken = channels.filter((channel) => channel.status !== 'connected');
  const percent = total === 0 ? 0 : Math.round((connected / total) * 100);

  return (
    <div className="flex flex-col gap-gutter">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter">
        <section className={CARD} aria-label={t('hub.stats.quota.title')}>
          <p className="font-label-md text-label-md text-on-surface-variant">
            {t('hub.stats.quota.title')}
          </p>
          <p className="text-on-surface">
            <span className="font-headline-lg text-headline-lg">{connected}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">
              {' '}
              / {total} {t('hub.stats.quota.unit')}
            </span>
          </p>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 rounded-full bg-surface-container overflow-hidden"
          >
            <div className="h-full bg-primary-container" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant mt-auto pt-2">
            <span>{t('hub.stats.quota.upsellQuestion')}</span>
            <Link
              href="/app/settings/billing"
              className="text-primary font-title-sm text-title-sm flex items-center gap-1"
            >
              {t('hub.stats.quota.upsell')}
              <Icon name="chevron_right" size={14} />
            </Link>
          </div>
        </section>

        <section className={CARD} aria-label={t('hub.stats.oauth.title')}>
          <div className="flex items-center justify-between">
            <p className="font-label-md text-label-md text-on-surface-variant">
              {t('hub.stats.oauth.title')}
            </p>
            <span
              aria-hidden="true"
              className={cn(
                'size-2.5 rounded-full',
                broken.length > 0 ? 'bg-error' : 'bg-[#237A36]',
              )}
            />
          </div>
          <p className="text-on-surface flex items-baseline gap-2">
            <span className="font-headline-lg text-headline-lg text-primary">{connected}</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {t('hub.stats.oauth.stable')}
            </span>
            <span className="text-on-surface-variant">/</span>
            <span
              className={cn(
                'font-headline-lg text-headline-lg',
                broken.length > 0 ? 'text-error' : 'text-on-surface-variant',
              )}
            >
              {broken.length}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {t('hub.stats.oauth.errors')}
            </span>
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {broken.length > 0
              ? t('hub.stats.oauth.needReauth', { count: broken.length })
              : t('hub.stats.oauth.allOk')}
          </p>
        </section>

        <section className={CARD} aria-label={t('hub.stats.today.title')}>
          <p className="font-label-md text-label-md text-on-surface-variant">
            {t('hub.stats.today.title')}
          </p>
          <p className="font-headline-lg text-headline-lg text-on-surface">
            {t('hub.stats.today.total', { count: interactions })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface-container p-2">
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t('hub.stats.today.comments')}
              </p>
              <p className="font-title-md text-title-md text-on-surface">{totals.comments24h}</p>
            </div>
            <div className="rounded-lg bg-surface-container p-2">
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {t('hub.stats.today.dm')}
              </p>
              <p className="font-title-md text-title-md text-on-surface">{totals.messages24h}</p>
            </div>
          </div>
        </section>

        <section className={CARD} aria-label={t('hub.stats.ai.title')}>
          <p className="font-label-md text-label-md text-on-surface-variant">
            {t('hub.stats.ai.title')}
          </p>
          <p className="font-headline-lg text-headline-lg text-primary">
            {aiPercent === null ? '—' : t('hub.stats.ai.value', { percent: aiPercent })}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {aiPercent === null
              ? t('hub.stats.ai.empty')
              : t('hub.stats.ai.body', { auto: totals.autoReplied7d, total: totals.comments7d })}
          </p>
        </section>
      </div>

      {broken.length > 0 ? (
        <section
          role="alert"
          className="rounded-xl bg-error-container text-on-error-container p-space-lg flex flex-col lg:flex-row lg:items-center justify-between gap-space-md"
        >
          <div className="flex items-start gap-space-md">
            <span className="shrink-0 size-12 rounded-xl bg-error text-on-error grid place-items-center">
              <Icon name="warning" size={24} />
            </span>
            <div>
              <h2 className="font-title-md text-title-md">
                {t('hub.alert.title', { name: broken[0]?.name ?? '', count: broken.length })}
              </h2>
              <p className="font-body-sm text-body-sm mt-1 max-w-3xl">{t('hub.alert.body')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <a href={`#channel-${broken[0]?.id}`} className={twBtn({ tone: 'plain' })}>
              {t('hub.alert.details')}
            </a>
            {broken.some((channel) => reconnectable.has(channel.id)) && connectHref ? (
              <a href={connectHref} className={twBtn({ tone: 'danger' })}>
                <Icon name="bolt" size={16} />
                {t('hub.alert.reauth')}
              </a>
            ) : (
              <span className="font-body-sm text-body-sm">{t('recovery.ownerOnly')}</span>
            )}
          </div>
        </section>
      ) : null}

      {PLATFORMS.map((platform) => {
        const rows = channels.filter((channel) => channel.platform === platform);
        return (
          <section
            key={platform}
            aria-labelledby={`platform-${platform}`}
            className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden"
          >
            <header className="bg-surface-container-low px-space-lg py-space-md flex items-center justify-between gap-space-md flex-wrap">
              <div className="flex items-center gap-space-sm">
                <span
                  className={cn(
                    'size-10 rounded-full grid place-items-center',
                    PLATFORM_TINT[platform],
                  )}
                >
                  <Icon name={PLATFORM_ICON[platform]} size={20} />
                </span>
                <div>
                  <h2
                    id={`platform-${platform}`}
                    className="font-title-md text-title-md text-on-surface flex items-center gap-2 flex-wrap"
                  >
                    {t(`hub.groups.${platform}.title`)}
                    <TwChip tone="neutral">{t('hub.groups.count', { count: rows.length })}</TwChip>
                    {platform === 'tiktok' ? (
                      <TwChip tone="warn">{t('hub.groups.beta')}</TwChip>
                    ) : null}
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {t(`hub.groups.${platform}.sub`)}
                  </p>
                </div>
              </div>
            </header>
            <div className="p-space-lg flex flex-col gap-space-md">
              {rows.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {t('hub.groups.empty', { platform: t(`platform.${platform}`) })}
                  {platform === 'facebook' && connectHref ? (
                    <>
                      {' '}
                      <a href={connectHref} className="text-primary font-title-sm text-title-sm">
                        {t('connect')}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              {rows.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  activity={activity.byChannel[channel.id]}
                  locale={locale}
                  canReconnect={reconnectable.has(channel.id) && connectHref !== null}
                  connectHref={connectHref}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="bg-surface-container-low rounded-xl p-space-lg flex items-start justify-between gap-space-md flex-wrap">
        <div className="flex items-start gap-space-sm">
          <span className="text-primary mt-0.5">
            <Icon name="verified_user" size={20} />
          </span>
          <div>
            <h2 className="font-title-sm text-title-sm text-on-surface">{t('hub.policy.title')}</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant max-w-3xl">
              {t('hub.policy.body')}
            </p>
          </div>
        </div>
        <Link href="/app/settings/privacy" className="text-primary font-title-sm text-title-sm">
          {t('hub.policy.link')}
        </Link>
      </section>
    </div>
  );
}

async function ChannelRow({
  channel,
  activity,
  locale,
  canReconnect,
  connectHref,
}: {
  channel: ChannelListItem;
  activity: ChannelActivity['byChannel'][string] | undefined;
  locale: string;
  canReconnect: boolean;
  connectHref: string | null;
}) {
  const t = await getTranslations('channels');
  const ok = channel.status === 'connected';
  const revoked = channel.status === 'revoked';
  const initial = channel.name.trim().charAt(0).toUpperCase() || '?';
  const advancedId = `channel-advanced-${channel.id}`;
  const disconnectId = `channel-disconnect-${channel.id}`;
  const checkedAt = channel.lastCheckedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
        channel.lastCheckedAt,
      )
    : null;
  const lastComment = activity?.lastCommentAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
        activity.lastCommentAt,
      )
    : null;
  return (
    <article
      id={`channel-${channel.id}`}
      className={cn(
        'rounded-xl p-space-md flex flex-col lg:flex-row lg:items-center justify-between gap-space-md',
        ok ? 'bg-surface-container' : 'bg-error-container/40',
      )}
    >
      <div className="flex items-start gap-space-md min-w-0">
        <span className="relative shrink-0 size-14 rounded-full bg-surface-container-lowest grid place-items-center font-title-md text-title-md text-primary">
          {initial}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-5 rounded-full grid place-items-center text-white',
              ok ? 'bg-primary-container' : 'bg-error',
            )}
          >
            <Icon name={ok ? 'check' : 'warning'} size={12} />
          </span>
        </span>
        <div className="min-w-0 space-y-1.5">
          <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2 flex-wrap">
            {channel.name}
            <TwChip tone={ok ? 'ok' : 'error'} dot>
              {t(`status.${channel.status}`)}
            </TwChip>
          </h3>
          <p
            className={cn(
              'font-body-sm text-body-sm flex items-center gap-1.5',
              ok && channel.webhookSubscribed ? 'text-on-surface-variant' : 'text-error',
            )}
          >
            <Icon name="cell_tower" size={14} />
            {ok && channel.webhookSubscribed ? t('hub.row.webhookOk') : t('list.noWebhook')}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-x-4 gap-y-1 flex-wrap">
            <span>{t('hub.row.comments24h', { count: activity?.comments24h ?? 0 })}</span>
            <span>
              {lastComment
                ? t('hub.row.lastComment', { time: lastComment })
                : t('hub.row.noComment')}
            </span>
          </p>
          <p
            className={cn(
              'font-body-sm text-body-sm',
              channel.lastCheckResult === 'ok'
                ? 'text-[#237A36]'
                : channel.lastCheckResult === null
                  ? 'text-on-surface-variant'
                  : 'text-error',
            )}
          >
            {channel.lastCheckResult === null
              ? t('hub.row.neverChecked')
              : `${t(CHECK_LABEL[channel.lastCheckResult])} · ${t('hub.row.checkedAt', { time: checkedAt ?? '' })}`}
          </p>
          {ok ? null : (
            <p className="font-body-sm text-body-sm text-error">
              {t(`recovery.cause.${channel.status}`)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {canReconnect && connectHref ? (
          <a href={connectHref} className={twBtn({ tone: ok ? 'soft' : 'primary' })}>
            <Icon name="lock_reset" size={16} />
            {t('reconnect')}
          </a>
        ) : null}
        <TwSoonButton tone="soft" soon={t('hub.soon')}>
          <Icon name="sync" size={16} />
          {t('hub.row.sync')}
        </TwSoonButton>
        <TwDialogTrigger dialogId={advancedId} className={twBtn({ tone: 'primary' })}>
          <Icon name="tune" size={16} />
          {t('hub.row.advanced')}
        </TwDialogTrigger>
        {revoked ? (
          <TwSoonButton tone="plain" soon={t('hub.row.alreadyDisconnected')}>
            <Icon name="link_off" size={16} />
            <span className="sr-only">{t('hub.row.disconnect')}</span>
          </TwSoonButton>
        ) : (
          <TwDialogTrigger dialogId={disconnectId} className={twBtn({ tone: 'plain' })}>
            <Icon name="link_off" size={16} />
            <span className="sr-only">{t('hub.row.disconnect')}</span>
          </TwDialogTrigger>
        )}
      </div>

      <TwDialog
        dialogId={advancedId}
        title={t('hub.row.advancedTitle', { name: channel.name })}
        icon={<Icon name="tune" size={20} />}
      >
        <form action={setChannelLanguageAction} className="space-y-space-md">
          <input type="hidden" name="channelId" value={channel.id} />
          <label
            htmlFor={`reply-language-${channel.id}`}
            className="font-title-sm text-title-sm text-on-surface"
          >
            {t('hub.row.replyLanguage')}
          </label>
          <select
            id={`reply-language-${channel.id}`}
            name="language"
            defaultValue={channel.replyLanguage}
            className="w-full rounded-lg bg-surface-container px-3 py-2 font-body-md text-body-md text-on-surface"
          >
            {REPLY_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {t(`hub.option.${language}`)}
              </option>
            ))}
          </select>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t('hub.row.replyLanguageHint')}
          </p>
          <div className="flex justify-end">
            <TwSubmit tone="primary">{t('hub.row.save')}</TwSubmit>
          </div>
        </form>
      </TwDialog>

      {revoked ? null : (
        <TwDialog
          dialogId={disconnectId}
          title={t('hub.row.disconnectTitle', { name: channel.name })}
          icon={<Icon name="link_off" size={24} />}
          tone="danger"
        >
          <form action={disconnectChannelAction} className="space-y-space-md">
            <input type="hidden" name="channelId" value={channel.id} />
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('hub.row.disconnectBody')}
            </p>
            <div className="flex justify-end">
              <TwSubmit tone="danger">{t('hub.row.disconnectConfirm')}</TwSubmit>
            </div>
          </form>
        </TwDialog>
      )}
    </article>
  );
}
