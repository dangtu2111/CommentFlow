'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { cx } from '../../lib/cx';
import { COMPOSER_PLATFORMS, type ComposerPlatform, counterOf } from '../../lib/post-counters';
import { Icon, type IconName } from '../ui/icon';

/**
 * Biên tập bài viết (design/stitch/composer.html, COMPOSER-CALENDAR-UI, Q-CMP1): GIAO DIỆN soạn bài — chưa lưu, chưa lên lịch, chưa đăng. Dữ liệu THẬT: kênh đã kết nối,
 * bộ đếm ký tự theo nền tảng, bản xem trước theo nội dung đang gõ. Mọi thứ chưa có backend (AI caption, media, gắn sản phẩm, lưu/lên lịch/đăng) vô hiệu kèm "Sắp có".
 * Không có số liệu/gợi ý/tên mẫu như trong thiết kế (khung giờ vàng, hashtag gợi ý, sản phẩm mẫu…). Chỉ dùng bên trong `.tw`.
 */
export type ComposerChannel = {
  id: string;
  name: string;
  platform: string;
  status: 'connected' | 'expired' | 'revoked' | 'error';
};

const PLATFORM_ICON: Record<ComposerPlatform, IconName> = {
  facebook: 'public',
  instagram: 'photo_camera',
  tiktok: 'music_note',
};

const DEFAULT_PLATFORM: ComposerPlatform = 'facebook';
const formatCount = (value: number): string => value.toLocaleString('vi-VN');
/** Nút định dạng của thanh công cụ (chưa có chức năng → vô hiệu kèm "Sắp có"). */
const TOOLBAR: ReadonlyArray<{
  icon: IconName;
  label: 'content.emoji' | 'content.mention' | 'content.link';
}> = [
  { icon: 'sentiment_satisfied', label: 'content.emoji' },
  { icon: 'alternate_email', label: 'content.mention' },
  { icon: 'link', label: 'content.link' },
];

const isPlatform = (value: string): value is ComposerPlatform =>
  (COMPOSER_PLATFORMS as readonly string[]).includes(value);

const card =
  'flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm';
const disabledBtn =
  'inline-flex cursor-not-allowed items-center gap-space-xs rounded-lg px-space-md py-space-sm font-title-sm text-title-sm opacity-60';

export function ComposerStudio({
  channels,
  timeZone,
}: {
  channels: ComposerChannel[];
  timeZone: string;
}) {
  const t = useTranslations('composer');
  const textId = useId();
  const usable = channels.filter((channel) => channel.status === 'connected');
  const [selected, setSelected] = useState<string[]>(usable.map((channel) => channel.id));
  const [text, setText] = useState('');
  const [tab, setTab] = useState<ComposerPlatform>('facebook');
  const soon = t('soon');

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  const previewChannel = channels.find(
    (channel) => selected.includes(channel.id) && channel.platform === tab,
  );

  return (
    <div className="space-y-space-lg">
      <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-space-md">
          <Link
            href="/app/calendar"
            className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface-variant transition-colors hover:text-primary"
          >
            <Icon name="arrow_back" size={18} />
            <span>{t('back')}</span>
          </Link>
          <span className="text-outline-variant">/</span>
          <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
            {t('heading')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={soon}
            className={cx(disabledBtn, 'bg-surface-container-high text-on-surface')}
          >
            <Icon name="draft" size={18} />
            {t('actions.draft')}
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={soon}
            className={cx(disabledBtn, 'bg-surface-container-low text-primary')}
          >
            <Icon name="schedule_send" size={18} />
            {t('actions.schedule')}
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={soon}
            className={cx(disabledBtn, 'bg-primary-container text-on-primary font-bold')}
          >
            <Icon name="rocket_launch" size={18} />
            {t('actions.publish')}
          </button>
        </div>
      </div>

      <p
        role="note"
        className="flex items-start gap-space-xs rounded-lg bg-tertiary-fixed/40 p-space-md font-body-sm text-body-sm text-on-surface"
      >
        <span className="mt-0.5 text-tertiary">
          <Icon name="info" size={16} />
        </span>
        <span>{t('banner')}</span>
      </p>

      <div className="grid grid-cols-12 items-start gap-space-lg">
        <div className="col-span-12 flex flex-col gap-space-lg lg:col-span-7">
          <section className={card} aria-labelledby={`${textId}-channels`}>
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <h2
                id={`${textId}-channels`}
                className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface"
              >
                <span className="text-primary">
                  <Icon name="hub" size={20} />
                </span>
                {t('channels.title')}
              </h2>
              <span
                className="flex cursor-not-allowed items-center gap-space-xs font-label-md text-label-md text-on-surface-variant opacity-60"
                title={soon}
              >
                <input type="checkbox" disabled aria-label={t('channels.custom')} />
                {t('channels.custom')}
              </span>
            </div>
            {channels.length === 0 ? (
              <div className="rounded-lg bg-surface-container-low p-space-md">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {t('channels.empty')}
                </p>
                <Link
                  href="/app/channels"
                  className="mt-space-xs inline-block font-label-md text-label-md text-primary hover:underline"
                >
                  {t('channels.connect')}
                </Link>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
                {channels.map((channel) => {
                  const ok = channel.status === 'connected';
                  const platform = isPlatform(channel.platform)
                    ? channel.platform
                    : DEFAULT_PLATFORM;
                  const id = `${textId}-ch-${channel.id}`;
                  return (
                    <li key={channel.id}>
                      <label
                        htmlFor={id}
                        className={cx(
                          'flex items-start gap-space-sm rounded-lg bg-surface-container-low p-space-sm transition-colors',
                          ok ? 'cursor-pointer hover:bg-surface-container' : 'opacity-60',
                        )}
                        title={ok ? undefined : t('channels.unusable')}
                      >
                        <input
                          id={id}
                          type="checkbox"
                          className="mt-1 accent-primary"
                          disabled={!ok}
                          checked={ok && selected.includes(channel.id)}
                          onChange={() => toggle(channel.id)}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-space-xs font-title-sm text-title-sm font-semibold text-on-surface">
                            <Icon name={PLATFORM_ICON[platform]} size={16} />
                            <span className="truncate">{channel.name}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
                            <span
                              className={cx(
                                'h-1.5 w-1.5 rounded-full',
                                ok ? 'bg-primary-container' : 'bg-outline',
                              )}
                              aria-hidden="true"
                            />
                            {t(`channels.status.${channel.status}`)}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t('channels.selected', { count: selected.length })}
            </p>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
                <span className="text-primary">
                  <Icon name="edit_note" size={20} />
                </span>
                {t('content.title')}
              </h2>
              <div className="flex flex-wrap items-center gap-space-xs">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={soon}
                  className="inline-flex cursor-not-allowed items-center gap-space-xs rounded-full bg-secondary-fixed px-space-sm py-1 font-label-md text-label-md font-semibold text-on-secondary-fixed opacity-60"
                >
                  <Icon name="magic_button" size={15} />
                  {t('content.aiCaption')}
                </button>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={soon}
                  className="inline-flex cursor-not-allowed items-center gap-space-xs rounded-full bg-surface-container-high px-space-sm py-1 font-label-md text-label-md font-semibold text-secondary opacity-60"
                >
                  <Icon name="tag" size={15} />
                  {t('content.aiHashtag')}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-low p-space-xs">
              {TOOLBAR.map(({ icon, label: key }) => (
                <button
                  key={key}
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={`${t(key)} · ${soon}`}
                  aria-label={t(key)}
                  className="cursor-not-allowed rounded p-1 text-on-surface-variant opacity-60"
                >
                  <Icon name={icon} size={18} />
                </button>
              ))}
            </div>
            <label htmlFor={`${textId}-text`} className="sr-only">
              {t('content.label')}
            </label>
            <textarea
              id={`${textId}-text`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={t('content.placeholder')}
              className="w-full resize-y rounded-lg bg-surface-container-lowest p-space-md font-body-md text-body-md leading-relaxed text-on-surface shadow-inner outline-none focus:bg-surface-container-low"
            />
            <ul
              className="flex flex-wrap items-center gap-space-md rounded-lg bg-surface-container-low px-space-md py-space-xs font-label-sm text-label-sm"
              aria-label={t('content.counters')}
            >
              {COMPOSER_PLATFORMS.map((platform) => {
                const counter = counterOf(text, platform);
                return (
                  <li
                    key={platform}
                    className={cx(
                      'flex items-center gap-1',
                      counter.over ? 'font-semibold text-error' : 'text-on-surface-variant',
                    )}
                  >
                    <strong className="font-semibold">{t(`channels.platform.${platform}`)}:</strong>
                    {formatCount(counter.count)} / {formatCount(counter.limit)}
                    {counter.over ? <span> · {t('content.over')}</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={card}>
            <div className="flex items-center justify-between gap-space-sm">
              <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
                <span className="text-primary">
                  <Icon name="perm_media" size={20} />
                </span>
                {t('media.title')}
              </h2>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={soon}
                className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg bg-surface-container-low px-space-sm py-1 font-label-md text-label-md font-semibold text-primary opacity-60"
              >
                <Icon name="add_photo_alternate" size={16} />
                {t('media.add')}
              </button>
            </div>
            <p className="rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
              {t('media.empty')}
            </p>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
                <span className="text-secondary">
                  <Icon name="auto_awesome" size={20} />
                </span>
                {t('products.title')}
              </h2>
              <Link
                href="/app/kb"
                className="inline-flex items-center gap-1 font-label-md text-label-md font-semibold text-primary hover:underline"
              >
                <Icon name="database" size={16} />
                {t('products.openKb')}
              </Link>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('products.hint')}
            </p>
            <div className="flex flex-wrap items-center gap-space-sm">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={soon}
                className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg bg-secondary-fixed px-space-sm py-1 font-label-md text-label-md font-semibold text-on-secondary-fixed opacity-60"
              >
                <Icon name="sell" size={16} />
                {t('products.pin')}
              </button>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {t('products.empty')}
              </span>
            </div>
            <label
              htmlFor={`${textId}-note`}
              className="flex items-center gap-space-xs font-label-md text-label-md text-on-surface"
            >
              <Icon name="lock" size={14} />
              {t('products.noteLabel')}
            </label>
            <textarea
              id={`${textId}-note`}
              disabled
              aria-disabled="true"
              title={soon}
              rows={3}
              placeholder={t('products.notePlaceholder')}
              className="w-full cursor-not-allowed resize-none rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm opacity-60"
            />
            <p className="flex flex-wrap items-center gap-space-xs rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">
              <Icon name="psychology" size={16} />
              <span>{t('products.rules')}</span>
              <Link
                href="/app/automation"
                className="font-label-md text-label-md text-primary hover:underline"
              >
                {t('products.rulesLink')}
              </Link>
            </p>
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
              <span className="text-primary">
                <Icon name="event_upcoming" size={20} />
              </span>
              {t('schedule.title')}
            </h2>
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                {t('schedule.date')}
                <input
                  type="date"
                  className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                {t('schedule.time')}
                <input
                  type="time"
                  className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none"
                />
              </label>
            </div>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t('schedule.zone', { zone: timeZone })} · {t('schedule.unavailable')}
            </p>
          </section>
        </div>

        <aside className="col-span-12 flex flex-col gap-space-md lg:sticky lg:top-space-lg lg:col-span-5">
          <section className={card} aria-label={t('preview.title')}>
            <div className="flex items-center justify-between gap-space-sm">
              <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                {t('preview.title')}
              </h2>
              <div
                role="tablist"
                className="flex items-center gap-1 rounded-lg bg-surface-container-low p-1"
              >
                {COMPOSER_PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    role="tab"
                    aria-selected={tab === platform}
                    onClick={() => setTab(platform)}
                    className={cx(
                      'rounded px-space-sm py-1 font-label-md text-label-md transition-colors',
                      tab === platform
                        ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface',
                    )}
                  >
                    {t(`preview.tabs.${platform}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-surface-container-low p-space-md">
              <div className="flex items-center gap-space-sm">
                <span
                  className="grid size-10 place-items-center rounded-full bg-primary-fixed text-primary"
                  aria-hidden="true"
                >
                  <Icon name={PLATFORM_ICON[tab]} size={20} />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-title-sm text-title-sm font-semibold text-on-surface">
                    {previewChannel?.name ?? t('preview.noPage')}
                  </div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant">
                    {t('preview.justNow')}
                  </div>
                </div>
              </div>
              <p className="mt-space-md whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface">
                {text.trim() === '' ? (
                  <span className="text-on-surface-variant">{t('preview.empty')}</span>
                ) : (
                  text
                )}
              </p>
              <div className="mt-space-md flex items-center justify-around border-t border-outline-variant pt-space-sm font-label-md text-label-md text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <Icon name="thumb_up" size={16} />
                  {t('preview.like')}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="chat_bubble_outline" size={16} />
                  {t('preview.comment')}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="share" size={16} />
                  {t('preview.share')}
                </span>
              </div>
            </div>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t('preview.disclaimer')}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
