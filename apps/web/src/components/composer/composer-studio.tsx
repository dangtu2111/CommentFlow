'use client';

import type { CaptionNotReady } from '@flow/ai';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition } from 'react';
import {
  cancelPublishScheduleAction,
  deletePublishPostAction,
  savePublishPostAction,
  suggestCaptionAction,
} from '../../app/app/(guarded)/composer/actions';
import { cx } from '../../lib/cx';
import { COMPOSER_PLATFORMS, type ComposerPlatform, counterOf } from '../../lib/post-counters';
import { MAX_PRODUCTS } from '../../lib/publish-form';
import { safeHttpsUrl } from '../../lib/safe-url';
import { appendHashtags, insertAtCursor, parseHttpsLink } from '../../lib/text-insert';
import type { SuggestionResult } from '../../server/caption-service';
import { Icon, type IconName } from '../ui/icon';
import { type ComposerMedia, MediaUploader } from './media-uploader';
import { PendingNote, PendingSubmit } from './pending-submit';
import { ChannelAvatar, PostPreview } from './post-preview';

/**
 * Biên tập bài viết (design/stitch/composer.html, COMPOSER-CALENDAR-UI + POST-PUBLISHING, Q-CMP1/Q-PUB1): biểu mẫu soạn bài với Server Action thật — LƯU NHÁP, LÊN LỊCH, ĐĂNG NGAY
 * (hai nút sau chỉ bật khi cờ `FB_PUBLISH_ENABLED` bật). Dữ liệu THẬT: kênh đã kết nối (mặc định KHÔNG chọn kênh nào để không đăng nhầm), bộ đếm ký tự theo nền tảng, bản xem trước.
 * Phần chưa có backend (AI caption, media, gắn sản phẩm) vô hiệu kèm "Sắp có". Không có số liệu/gợi ý/tên mẫu như trong thiết kế. Chỉ dùng bên trong `.tw`.
 */
export type ComposerChannel = {
  id: string;
  name: string;
  platform: string;
  /** Ảnh đại diện của kênh (https) hoặc `null`. */
  avatarUrl: string | null;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  /** Kênh có quyền `pages_manage_posts` (cần để đăng bài); thiếu → cảnh báo, vẫn lưu nháp được. */
  canPublish: boolean;
};

/** Sản phẩm đang bán để chọn gắn vào bài (giá đọc từ bảng sản phẩm). */
export type ComposerProduct = {
  id: string;
  name: string;
  sku: string | null;
  priceVnd: number | null;
  imageUrl: string | null;
};

/** Bài đang sửa (từ `?id=`); bài mới không có. Giờ lên lịch đã đổi sang ngày/giờ ĐỊA PHƯƠNG của cửa hàng. */
export type ComposerInitial = {
  id: string;
  message: string;
  channelIds: string[];
  productIds: string[];
  status: 'draft' | 'scheduled';
  date: string;
  time: string;
};

const PLATFORM_ICON: Record<ComposerPlatform, IconName> = {
  facebook: 'public',
  instagram: 'photo_camera',
  tiktok: 'music_note',
};

const DEFAULT_PLATFORM: ComposerPlatform = 'facebook';
const formatCount = (value: number): string => value.toLocaleString('vi-VN');
const EMOJIS = ['😍', '🔥', '✨', '🎉', '👍', '❤️', '🛍️', '🚚', '💯', '🙏'] as const;

const isPlatform = (value: string): value is ComposerPlatform =>
  (COMPOSER_PLATFORMS as readonly string[]).includes(value);

const card =
  'flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm';
const actionBtn =
  'inline-flex items-center gap-space-xs rounded-lg px-space-md py-space-sm font-title-sm text-title-sm transition-colors';

/** Ảnh nhỏ của sản phẩm (chỉ https; không có/không hợp lệ → biểu tượng thay thế). */
function ProductThumb({ url, size }: { url: string | null; size: 'sm' | 'md' }) {
  const src = safeHttpsUrl(url);
  const box = size === 'md' ? 'h-10 w-10' : 'h-6 w-6';
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high text-on-surface-variant',
        box,
      )}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: ảnh CDN của nguồn sản phẩm (không qua next/image, tên miền do CSP kiểm soát)
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <Icon name="sell" size={size === 'md' ? 18 : 12} />
      )}
    </span>
  );
}

export function ComposerStudio({
  channels,
  timeZone,
  publishEnabled,
  products,
  mediaEnabled,
  initialMedia,
  aiReason,
  initial,
}: {
  channels: ComposerChannel[];
  products: ComposerProduct[];
  /** Kho ảnh/video đã cấu hình (`MEDIA_S3_*`); chưa → khóa phần tải lên kèm lý do. */
  mediaEnabled: boolean;
  initialMedia: ComposerMedia[];
  timeZone: string;
  /** Cờ `FB_PUBLISH_ENABLED` của web: tắt → chỉ lưu nháp được. */
  publishEnabled: boolean;
  /** Vì sao AI soạn caption chưa dùng được (`null` = dùng được). */
  aiReason: CaptionNotReady | null;
  initial?: ComposerInitial;
}) {
  const t = useTranslations('composer');
  const textId = useId();
  const [selected, setSelected] = useState<string[]>(initial?.channelIds ?? []);
  const [text, setText] = useState(initial?.message ?? '');
  const [tab, setTab] = useState<ComposerPlatform>('facebook');
  const soon = t('soon');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaList, setMediaList] = useState<ComposerMedia[]>(initialMedia);
  const [pickedIds, setPickedIds] = useState<string[]>(initial?.productIds ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const pickedProducts = pickedIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is ComposerProduct => product !== undefined);
  const needle = productQuery.trim().toLowerCase();
  const visibleProducts = products.filter(
    (product) =>
      needle === '' ||
      product.name.toLowerCase().includes(needle) ||
      (product.sku ?? '').toLowerCase().includes(needle),
  );
  const toggleProduct = (id: string) =>
    setPickedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= MAX_PRODUCTS
          ? current
          : [...current, id],
    );
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startAi] = useTransition();
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [panel, setPanel] = useState<'emoji' | 'link' | null>(null);
  const [link, setLink] = useState('');
  const [linkBad, setLinkBad] = useState(false);
  const aiReady = aiReason === null;
  const aiHint = aiReason === null ? undefined : t(`ai.notReady.${aiReason}`);

  const insert = (value: string) => {
    const el = areaRef.current;
    const from = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? text.length;
    const next = insertAtCursor(text, from, to, value);
    setText(next.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.cursor, next.cursor);
    });
  };
  const ask = (kind: 'caption' | 'hashtags') =>
    startAi(async () => {
      setSuggestion(null);
      setSuggestion(await suggestCaptionAction(kind, text));
    });
  const addLink = () => {
    const url = parseHttpsLink(link);
    setLinkBad(url === null);
    if (url === null) return;
    insert(`${text === '' || text.endsWith('\n') ? '' : '\n'}${url}`);
    setLink('');
    setPanel(null);
  };

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  const previewChannel = channels.find(
    (channel) => selected.includes(channel.id) && channel.platform === tab,
  );
  // Tiện ích phía trình duyệt: DB và Server Action kiểm lại tất cả; nút bị khóa chỉ để người dùng khỏi bấm vô ích.
  const ready = text.trim() !== '' && selected.length > 0;
  const canSend = publishEnabled && ready && !mediaBusy;
  const missingPermission = channels.filter(
    (channel) => selected.includes(channel.id) && !channel.canPublish,
  );

  return (
    <form action={savePublishPostAction} className="space-y-space-lg">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial ? <input type="hidden" name="postId" value={initial.id} /> : null}
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
            {initial ? t('headingEdit') : t('heading')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {initial ? (
            <PendingSubmit
              formAction={deletePublishPostAction}
              formNoValidate
              className={cx(actionBtn, 'bg-surface-container-low text-error')}
            >
              <Icon name="delete" size={18} />
              {t('actions.delete')}
            </PendingSubmit>
          ) : null}
          {initial?.status === 'scheduled' ? (
            <PendingSubmit
              formAction={cancelPublishScheduleAction}
              formNoValidate
              className={cx(actionBtn, 'bg-surface-container-low text-on-surface')}
            >
              <Icon name="event_busy" size={18} />
              {t('actions.cancelSchedule')}
            </PendingSubmit>
          ) : null}
          <PendingSubmit
            name="intent"
            value="draft"
            disabled={mediaBusy}
            pendingLabel={t('pending.draft')}
            className={cx(
              actionBtn,
              'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
            )}
          >
            <Icon name="draft" size={18} />
            {t('actions.draft')}
          </PendingSubmit>
          <PendingSubmit
            name="intent"
            value="schedule"
            pendingLabel={t('pending.schedule')}
            disabled={!canSend}
            aria-disabled={!canSend}
            title={publishEnabled ? undefined : t('publishDisabledShort')}
            className={cx(
              actionBtn,
              'bg-surface-container-low text-primary',
              canSend ? 'hover:bg-surface-container' : 'cursor-not-allowed opacity-60',
            )}
          >
            <Icon name="schedule_send" size={18} />
            {t('actions.schedule')}
          </PendingSubmit>
          <PendingSubmit
            name="intent"
            value="publish"
            pendingLabel={t('pending.publish')}
            disabled={!canSend}
            aria-disabled={!canSend}
            title={publishEnabled ? undefined : t('publishDisabledShort')}
            className={cx(
              actionBtn,
              'bg-primary-container font-bold text-on-primary',
              canSend ? 'hover:bg-primary' : 'cursor-not-allowed opacity-60',
            )}
          >
            <Icon name="rocket_launch" size={18} />
            {t('actions.publish')}
          </PendingSubmit>
        </div>
      </div>

      <PendingNote>{t('pending.note')}</PendingNote>
      <p
        role="note"
        className="flex items-start gap-space-xs rounded-lg bg-tertiary-fixed/40 p-space-md font-body-sm text-body-sm text-on-surface"
      >
        <span className="mt-0.5 text-tertiary">
          <Icon name="info" size={16} />
        </span>
        <span>{publishEnabled ? t('bannerEnabled') : t('banner')}</span>
      </p>
      {missingPermission.length > 0 ? (
        <p
          role="alert"
          className="flex items-start gap-space-xs rounded-lg bg-error-container/60 p-space-md font-body-sm text-body-sm text-on-error-container"
        >
          <Icon name="warning" size={16} />
          <span>
            {t('channels.missingPermission', {
              names: missingPermission.map((channel) => channel.name).join(', '),
            })}
          </span>
        </p>
      ) : null}

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
                          name="channel"
                          value={channel.id}
                          className="mt-1 accent-primary"
                          disabled={!ok}
                          checked={ok && selected.includes(channel.id)}
                          onChange={() => toggle(channel.id)}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-space-xs font-title-sm text-title-sm font-semibold text-on-surface">
                            <ChannelAvatar name={channel.name} url={channel.avatarUrl} size="xs" />
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
                          {ok && !channel.canPublish ? (
                            <span className="mt-1 font-label-sm text-label-sm text-error">
                              {t('channels.noPublishPermission')}
                            </span>
                          ) : null}
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
                  onClick={() => ask('caption')}
                  disabled={!aiReady || pending || text.trim() === ''}
                  title={aiHint}
                  className="inline-flex items-center gap-space-xs rounded-full px-space-sm py-1 font-label-md text-label-md font-semibold disabled:cursor-not-allowed disabled:opacity-60 bg-secondary-fixed text-on-secondary-fixed"
                >
                  <Icon name="magic_button" size={15} />
                  {pending ? t('ai.loading') : t('content.aiCaption')}
                </button>
                <button
                  type="button"
                  onClick={() => ask('hashtags')}
                  disabled={!aiReady || pending || text.trim() === ''}
                  title={aiHint}
                  className="inline-flex items-center gap-space-xs rounded-full px-space-sm py-1 font-label-md text-label-md font-semibold disabled:cursor-not-allowed disabled:opacity-60 bg-surface-container-high text-secondary"
                >
                  <Icon name="tag" size={15} />
                  {t('content.aiHashtag')}
                </button>
              </div>
            </div>
            {aiHint ? (
              <p className="font-label-sm text-label-sm text-on-surface-variant">{aiHint}</p>
            ) : null}
            {suggestion ? (
              <div role="status" className="rounded-lg bg-secondary-fixed/30 p-space-md">
                {suggestion.ok && suggestion.kind === 'caption' ? (
                  <>
                    <p className="whitespace-pre-wrap font-body-md text-body-md text-on-surface">
                      {suggestion.text}
                    </p>
                    <div className="mt-space-sm flex flex-wrap gap-space-xs">
                      <button
                        type="button"
                        className="rounded-full px-space-sm py-1 font-label-md text-label-md bg-primary text-on-primary"
                        onClick={() => {
                          setText(suggestion.text);
                          setSuggestion(null);
                        }}
                      >
                        {t('ai.useCaption')}
                      </button>
                      <button
                        type="button"
                        className="rounded-full px-space-sm py-1 font-label-md text-label-md bg-surface-container-high text-on-surface"
                        onClick={() => {
                          setText(`${text.replace(/\s+$/, '')}\n\n${suggestion.text}`.trim());
                          setSuggestion(null);
                        }}
                      >
                        {t('ai.appendCaption')}
                      </button>
                      <button
                        type="button"
                        className="rounded-full px-space-sm py-1 font-label-md text-label-md text-on-surface-variant"
                        onClick={() => setSuggestion(null)}
                      >
                        {t('ai.dismiss')}
                      </button>
                    </div>
                  </>
                ) : suggestion.ok ? (
                  <>
                    <p className="font-body-md text-body-md text-on-surface">
                      {suggestion.hashtags.join(' ')}
                    </p>
                    <div className="mt-space-sm flex flex-wrap gap-space-xs">
                      <button
                        type="button"
                        className="rounded-full px-space-sm py-1 font-label-md text-label-md bg-primary text-on-primary"
                        onClick={() => {
                          setText(appendHashtags(text, suggestion.hashtags));
                          setSuggestion(null);
                        }}
                      >
                        {t('ai.addHashtags')}
                      </button>
                      <button
                        type="button"
                        className="rounded-full px-space-sm py-1 font-label-md text-label-md text-on-surface-variant"
                        onClick={() => setSuggestion(null)}
                      >
                        {t('ai.dismiss')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="font-body-md text-body-md text-error">
                    {t(`ai.failure.${suggestion.reason}`)}
                  </p>
                )}
                <p className="mt-space-xs font-label-sm text-label-sm text-on-surface-variant">
                  {t('ai.disclaimer')}
                </p>
              </div>
            ) : null}
            <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-low p-space-xs">
              <button
                type="button"
                onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')}
                aria-expanded={panel === 'emoji'}
                aria-label={t('content.emoji')}
                title={t('content.emoji')}
                className="rounded p-1 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="sentiment_satisfied" size={18} />
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-label={t('content.mention')}
                title={t('content.mentionUnavailable')}
                className="cursor-not-allowed rounded p-1 text-on-surface-variant opacity-60"
              >
                <Icon name="alternate_email" size={18} />
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === 'link' ? null : 'link')}
                aria-expanded={panel === 'link'}
                aria-label={t('content.link')}
                title={t('content.link')}
                className="rounded p-1 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="link" size={18} />
              </button>
            </div>
            {panel === 'emoji' ? (
              <div className="flex flex-wrap gap-space-xs rounded-lg bg-surface-container-low p-space-xs">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insert(emoji)}
                    className="rounded p-1 text-xl hover:bg-surface-container-high"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            {panel === 'link' ? (
              <div className="flex flex-wrap items-center gap-space-xs rounded-lg bg-surface-container-low p-space-xs">
                <input
                  type="url"
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    setLinkBad(false);
                  }}
                  placeholder={t('content.linkPlaceholder')}
                  aria-label={t('content.link')}
                  aria-invalid={linkBad}
                  className="min-w-0 flex-1 rounded bg-surface-container-lowest px-space-sm py-1 font-body-sm text-body-sm outline-none"
                />
                <button
                  type="button"
                  onClick={addLink}
                  className="rounded-full px-space-sm py-1 font-label-md text-label-md bg-primary text-on-primary"
                >
                  {t('content.linkAdd')}
                </button>
                {linkBad ? (
                  <span className="font-label-sm text-label-sm text-error">
                    {t('content.linkInvalid')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <label htmlFor={`${textId}-text`} className="sr-only">
              {t('content.label')}
            </label>
            <textarea
              id={`${textId}-text`}
              ref={areaRef}
              name="message"
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

          <MediaUploader
            enabled={mediaEnabled}
            initial={initialMedia}
            onBusyChange={setMediaBusy}
            onChange={setMediaList}
          />

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
            <div className="flex flex-col gap-space-sm">
              <div className="flex flex-wrap items-center gap-space-sm">
                <button
                  type="button"
                  onClick={() => setPickerOpen(!pickerOpen)}
                  aria-expanded={pickerOpen}
                  disabled={products.length === 0}
                  title={products.length === 0 ? t('products.noCatalog') : undefined}
                  className="inline-flex items-center gap-1 bg-secondary-fixed text-on-secondary-fixed disabled:cursor-not-allowed disabled:opacity-60 rounded-lg px-space-sm py-1 font-label-md text-label-md font-semibold"
                >
                  <Icon name="sell" size={16} />
                  {t('products.pin')}
                </button>
                {pickedProducts.length === 0 ? (
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {products.length === 0 ? t('products.noCatalog') : t('products.empty')}
                  </span>
                ) : null}
              </div>
              {pickedProducts.map((product, index) => (
                <span
                  key={product.id}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed px-space-sm py-1 font-label-md text-label-md text-on-secondary-fixed"
                >
                  <input type="hidden" name="product" value={product.id} />
                  <ProductThumb url={product.imageUrl} size="sm" />
                  {index === 0 ? <Icon name="star" size={14} /> : null}
                  {product.name}
                  <button
                    type="button"
                    aria-label={t('products.remove', { name: product.name })}
                    onClick={() => toggleProduct(product.id)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
              ))}
              {pickedProducts.length > 0 ? (
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('products.primaryHint')}
                </p>
              ) : null}
              {pickerOpen ? (
                <div className="rounded-lg bg-surface-container-low p-space-sm">
                  <input
                    type="search"
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder={t('products.search')}
                    aria-label={t('products.search')}
                    className="mb-space-xs w-full rounded bg-surface-container-lowest px-space-sm py-1 font-body-sm text-body-sm outline-none"
                  />
                  <ul className="max-h-56 overflow-y-auto">
                    {visibleProducts.map((product) => {
                      const checked = pickedIds.includes(product.id);
                      const full = !checked && pickedIds.length >= MAX_PRODUCTS;
                      return (
                        <li key={product.id}>
                          <label className="flex cursor-pointer items-center gap-space-sm rounded px-space-xs py-1 hover:bg-surface-container-high">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={full}
                              onChange={() => toggleProduct(product.id)}
                            />
                            <ProductThumb url={product.imageUrl} size="md" />
                            <span className="min-w-0 flex-1 truncate font-body-sm text-body-sm text-on-surface">
                              {product.name}
                            </span>
                            {product.priceVnd === null ? null : (
                              <span className="font-label-sm text-label-sm text-on-surface-variant">
                                {t('products.price', { price: formatCount(product.priceVnd) })}
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-space-xs font-label-sm text-label-sm text-on-surface-variant">
                    {t('products.limit', { count: pickedIds.length, max: MAX_PRODUCTS })}
                  </p>
                </div>
              ) : null}
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
                  name="date"
                  defaultValue={initial?.date ?? ''}
                  className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface-variant">
                {t('schedule.time')}
                <input
                  type="time"
                  name="time"
                  defaultValue={initial?.time ?? ''}
                  className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none"
                />
              </label>
            </div>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t('schedule.zone', { zone: timeZone })} · {t('schedule.hint')}
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
            <PostPreview
              platform={tab}
              pageName={previewChannel?.name ?? null}
              pageAvatarUrl={previewChannel?.avatarUrl ?? null}
              text={text}
              media={mediaList}
            />
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {t('preview.disclaimer')}
            </p>
          </section>
        </aside>
      </div>
    </form>
  );
}
