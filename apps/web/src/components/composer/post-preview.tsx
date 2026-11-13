'use client';

import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode, type SyntheticEvent, useState } from 'react';
import { cx } from '../../lib/cx';
import { facebookLayout } from '../../lib/fb-media-layout';
import type { ComposerPlatform } from '../../lib/post-counters';
import { safeHttpsUrl } from '../../lib/safe-url';
import { Icon } from '../ui/icon';
import type { ComposerMedia } from './media-uploader';

/**
 * Bản xem trước bài đăng theo giao diện thật của từng nền tảng (Biên tập bài viết): Facebook (đầu bài, "Xem thêm", lưới ảnh 1–5, thanh phản ứng, Thích/Bình luận/Chia sẻ),
 * Instagram (khung vuông, nhiều ảnh có chỉ báo, hàng biểu tượng, chú thích "xem thêm") và TikTok (khung dọc 9:16, chú thích chồng lên). Chỉ minh họa bố cục, KHÔNG có số liệu giả:
 * mọi bộ đếm là 0. Hashtag và liên kết trong chữ được tô màu như nền tảng. Ảnh/video lấy từ route riêng tư của ứng dụng. Chỉ dùng bên trong `.tw`.
 */
export type PreviewProps = {
  platform: ComposerPlatform;
  /** Tên kênh đã chọn của nền tảng này; không có → chữ "Chưa chọn kênh". */
  pageName: string | null;
  /** Ảnh đại diện của kênh (https); không có → chữ cái đầu của tên. */
  pageAvatarUrl?: string | null;
  text: string;
  media: ComposerMedia[];
};

const FB_TEXT_LIMIT = 280;
const IG_TEXT_LIMIT = 125;
const TOKEN = /(#[\p{L}\p{N}_]+|https?:\/\/[^\s]+)/gu;

const mediaSrc = (item: ComposerMedia): string => `/app/api/media/${item.id}`;

/** Tên tài khoản kiểu Instagram: bỏ dấu, chữ thường, chỉ chữ-số-gạch dưới-chấm. */
export function handleOf(name: string | null): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

/** Chữ cái đầu để làm ảnh đại diện tạm của trang. */
const initialOf = (name: string | null): string =>
  name ? (Array.from(name.trim())[0]?.toUpperCase() ?? '?') : '?';

/** Tô màu hashtag và liên kết trong nội dung (giữ nguyên xuống dòng). */
const LINK_CLASS = { primary: 'text-primary', strong: 'font-semibold' } as const;

function RichText({ text, tone }: { text: string; tone: keyof typeof LINK_CLASS }) {
  const linkClass = LINK_CLASS[tone];
  return (
    <>
      {text.split(TOKEN).map((part, index) =>
        index % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: các đoạn chữ cố định theo vị trí, không đổi thứ tự
          <span key={index} className={linkClass}>
            {part}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: như trên
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Cắt nội dung dài + nút mở rộng ("Xem thêm"). */
function useClamp(text: string, limit: number) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return {
    long,
    open,
    toggle: () => setOpen((value) => !value),
    shown: long && !open ? `${text.slice(0, limit).trimEnd()}…` : text,
  };
}

const AVATAR_SIZE = {
  md: 'size-10 text-title-sm',
  sm: 'size-8 text-label-md',
  xs: 'size-5 text-label-sm',
} as const;

/** Ảnh đại diện tròn của kênh: ảnh thật (chỉ https) hoặc chữ cái đầu của tên. */
export function ChannelAvatar({
  name,
  url,
  size,
}: {
  name: string | null;
  url?: string | null;
  size: keyof typeof AVATAR_SIZE;
}) {
  const src = safeHttpsUrl(url);
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-fixed font-title-sm font-bold text-primary',
        AVATAR_SIZE[size],
      )}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: ảnh CDN của nền tảng (không qua next/image, tên miền do CSP kiểm soát)
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}

function VideoPlayer({ item, className }: { item: ComposerMedia; className: string }) {
  const t = useTranslations('composer');
  return (
    <video
      src={mediaSrc(item)}
      controls
      preload="metadata"
      className={className}
      aria-label={t('preview.video')}
    >
      <track kind="captions" />
    </video>
  );
}

/**
 * Lưới ảnh kiểu Facebook: bố cục chọn theo SỐ ẢNH và HƯỚNG ảnh (rộng/vuông/dọc) — xem `lib/fb-media-layout.ts`. Tỉ lệ thật của ảnh đo khi ảnh tải xong (chưa biết → coi như vuông).
 */
function FacebookMedia({ media }: { media: ComposerMedia[] }) {
  const t = useTranslations('composer');
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const first = media[0];
  if (!first) return null;
  if (first.kind === 'video') {
    return <VideoPlayer item={first} className="max-h-[28rem] w-full bg-black" />;
  }
  const layout = facebookLayout(media.map((item) => ratios[item.id] ?? 1));
  const measured = (id: string) => (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth === 0 || naturalHeight === 0) return;
    const ratio = naturalWidth / naturalHeight;
    setRatios((current) => (current[id] === ratio ? current : { ...current, [id]: ratio }));
  };
  return (
    <div
      className="grid gap-0.5 bg-surface-container-lowest"
      style={{
        aspectRatio: String(layout.aspect),
        gridTemplateColumns: layout.columns,
        gridTemplateRows: layout.rows,
      }}
    >
      {layout.cells.map((place) => {
        const item = media[place.index] as ComposerMedia;
        return (
          <div
            key={item.id}
            className="relative min-h-0 min-w-0 overflow-hidden bg-surface-container-high"
            style={{ gridColumn: place.column, gridRow: place.row }}
          >
            {/* biome-ignore lint/performance/noImgElement: xem trước từ route riêng tư của ứng dụng (không qua next/image) */}
            <img
              src={mediaSrc(item)}
              alt={t('preview.image', { n: place.index + 1 })}
              loading="lazy"
              onLoad={measured(item.id)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {layout.extra > 0 && place.index === layout.cells.length - 1 ? (
              <span className="absolute inset-0 grid place-items-center bg-black/55 font-headline-md text-headline-md font-bold text-white">
                +{layout.extra}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FacebookPreview({ pageName, pageAvatarUrl, text, media }: Omit<PreviewProps, 'platform'>) {
  const t = useTranslations('composer');
  const clamp = useClamp(text, FB_TEXT_LIMIT);
  const empty = text.trim() === '';
  return (
    <article className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <header className="flex items-center gap-space-sm p-space-md pb-space-sm">
        <ChannelAvatar name={pageName} url={pageAvatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-title-sm text-title-sm font-semibold text-on-surface">
            {pageName ?? t('preview.noPage')}
          </div>
          <div className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
            <span>{t('preview.justNow')}</span>
            <span aria-hidden="true">·</span>
            <Icon name="public" size={12} />
          </div>
        </div>
        <span className="text-on-surface-variant">
          <Icon name="more_horiz" size={20} />
        </span>
      </header>
      <div className="px-space-md pb-space-sm font-body-md text-body-md text-on-surface">
        {empty ? (
          <span className="text-on-surface-variant">{t('preview.empty')}</span>
        ) : (
          <p className="whitespace-pre-wrap break-words">
            <RichText text={clamp.shown} tone="primary" />
            {clamp.long ? (
              <button
                type="button"
                onClick={clamp.toggle}
                className="ml-1 font-semibold text-on-surface-variant hover:underline"
              >
                {clamp.open ? t('preview.seeLess') : t('preview.seeMore')}
              </button>
            ) : null}
          </p>
        )}
      </div>
      <FacebookMedia media={media} />
      <div className="flex items-center justify-between px-space-md py-space-sm font-label-md text-label-md text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-on-primary">
            <Icon name="thumb_up" size={12} />
          </span>
          <span className="grid size-5 place-items-center rounded-full bg-error text-on-error">
            <Icon name="favorite" size={12} />
          </span>
          <span className="ml-1">0</span>
        </span>
        <span>
          {t('preview.commentsCount', { count: 0 })} · {t('preview.sharesCount', { count: 0 })}
        </span>
      </div>
      <div className="mx-space-md flex items-center justify-around border-t border-outline-variant py-space-xs font-label-md text-label-md font-semibold text-on-surface-variant">
        <span className="flex items-center gap-1 py-1">
          <Icon name="thumb_up" size={18} />
          {t('preview.like')}
        </span>
        <span className="flex items-center gap-1 py-1">
          <Icon name="chat_bubble_outline" size={18} />
          {t('preview.comment')}
        </span>
        <span className="flex items-center gap-1 py-1">
          <Icon name="share" size={18} />
          {t('preview.share')}
        </span>
      </div>
    </article>
  );
}

function InstagramPreview({
  pageName,
  pageAvatarUrl,
  text,
  media,
}: Omit<PreviewProps, 'platform'>) {
  const t = useTranslations('composer');
  const handle = handleOf(pageName) || t('preview.handlePlaceholder');
  const clamp = useClamp(text, IG_TEXT_LIMIT);
  const [slide, setSlide] = useState(0);
  const current = Math.min(slide, Math.max(media.length - 1, 0));
  const item = media[current];
  const many = media.length > 1 && item?.kind !== 'video';
  return (
    <article className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <header className="flex items-center gap-space-sm p-space-sm">
        <span className="rounded-full bg-gradient-to-tr from-tertiary via-error to-secondary p-0.5">
          <span className="block rounded-full bg-surface-container-lowest p-0.5">
            <ChannelAvatar name={pageName} url={pageAvatarUrl} size="sm" />
          </span>
        </span>
        <div className="min-w-0 flex-1 truncate font-title-sm text-title-sm font-semibold text-on-surface">
          {handle}
        </div>
        <span className="text-on-surface">
          <Icon name="more_horiz" size={20} />
        </span>
      </header>
      <div className="relative aspect-square bg-surface-container-high">
        {item ? (
          item.kind === 'video' ? (
            <VideoPlayer item={item} className="h-full w-full bg-black object-cover" />
          ) : (
            // biome-ignore lint/performance/noImgElement: xem trước từ route riêng tư của ứng dụng
            <img
              src={mediaSrc(item)}
              alt={t('preview.image', { n: current + 1 })}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="grid h-full place-items-center p-space-lg text-center font-body-sm text-body-sm text-on-surface-variant">
            <span className="flex flex-col items-center gap-space-xs">
              <Icon name="image" size={32} />
              {t('preview.igNeedsMedia')}
            </span>
          </div>
        )}
        {many ? (
          <span className="absolute right-space-sm top-space-sm rounded-full bg-black/60 px-space-sm py-0.5 font-label-sm text-label-sm text-white">
            {current + 1}/{media.length}
          </span>
        ) : null}
        {many ? (
          <>
            <button
              type="button"
              aria-label={t('preview.prev')}
              disabled={current === 0}
              onClick={() => setSlide(current - 1)}
              className="absolute left-space-xs top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-on-surface disabled:hidden"
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <button
              type="button"
              aria-label={t('preview.next')}
              disabled={current === media.length - 1}
              onClick={() => setSlide(current + 1)}
              className="absolute right-space-xs top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-on-surface disabled:hidden"
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-space-md px-space-md pt-space-sm text-on-surface">
        <Icon name="favorite" size={24} />
        <Icon name="chat_bubble_outline" size={24} />
        <Icon name="send" size={24} />
        {many ? (
          <span className="mx-auto flex items-center gap-1" aria-hidden="true">
            {media.map((m, i) => (
              <span
                key={m.id}
                className={cx(
                  'size-1.5 rounded-full',
                  i === current ? 'bg-primary' : 'bg-outline-variant',
                )}
              />
            ))}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <Icon name="bookmark" size={24} />
      </div>
      <div className="px-space-md pb-space-md pt-space-xs font-body-sm text-body-sm text-on-surface">
        <div className="font-semibold">{t('preview.likesCount', { count: 0 })}</div>
        <p className="mt-0.5 whitespace-pre-wrap break-words">
          <span className="mr-1 font-semibold">{handle}</span>
          {text.trim() === '' ? (
            <span className="text-on-surface-variant">{t('preview.empty')}</span>
          ) : (
            <RichText text={clamp.shown} tone="primary" />
          )}
          {clamp.long ? (
            <button
              type="button"
              onClick={clamp.toggle}
              className="ml-1 text-on-surface-variant hover:underline"
            >
              {clamp.open ? t('preview.igSeeLess') : t('preview.igSeeMore')}
            </button>
          ) : null}
        </p>
        <div className="mt-1 font-label-sm text-label-sm uppercase text-on-surface-variant">
          {t('preview.justNow')}
        </div>
      </div>
    </article>
  );
}

function TikTokPreview({ pageName, text, media }: Omit<PreviewProps, 'platform'>) {
  const t = useTranslations('composer');
  const handle = handleOf(pageName) || t('preview.handlePlaceholder');
  const clamp = useClamp(text, IG_TEXT_LIMIT);
  const item = media[0];
  const rail: ReactNode[] = [
    <Icon key="like" name="favorite" size={28} />,
    <Icon key="comment" name="chat_bubble_outline" size={28} />,
    <Icon key="save" name="bookmark" size={28} />,
    <Icon key="share" name="share" size={28} />,
  ];
  return (
    <article className="relative mx-auto aspect-[9/16] max-h-[36rem] w-full max-w-xs overflow-hidden rounded-xl bg-black text-white">
      {item?.kind === 'video' ? (
        <VideoPlayer item={item} className="absolute inset-0 h-full w-full object-cover" />
      ) : item ? (
        // biome-ignore lint/performance/noImgElement: xem trước từ route riêng tư của ứng dụng
        <img
          src={mediaSrc(item)}
          alt={t('preview.image', { n: 1 })}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-space-lg text-center font-body-sm text-body-sm text-white/70">
          <span className="flex flex-col items-center gap-space-xs">
            <Icon name="music_note" size={32} />
            {t('preview.tiktokNeedsVideo')}
          </span>
        </div>
      )}
      <ul className="absolute bottom-space-xl right-space-sm flex flex-col items-center gap-space-md">
        {rail.map((icon) => (
          <li
            key={(icon as { key: string }).key}
            className="flex flex-col items-center gap-0.5 font-label-sm text-label-sm"
          >
            {icon}
            <span>0</span>
          </li>
        ))}
      </ul>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-space-md pr-16 font-body-sm text-body-sm">
        <div className="font-semibold">@{handle}</div>
        <p className="mt-0.5 whitespace-pre-wrap break-words">
          {text.trim() === '' ? (
            <span className="text-white/70">{t('preview.empty')}</span>
          ) : (
            <RichText text={clamp.shown} tone="strong" />
          )}
          {clamp.long ? (
            <button
              type="button"
              onClick={clamp.toggle}
              className="ml-1 text-white/70 hover:underline"
            >
              {clamp.open ? t('preview.igSeeLess') : t('preview.igSeeMore')}
            </button>
          ) : null}
        </p>
      </div>
    </article>
  );
}

export function PostPreview({ platform, ...rest }: PreviewProps) {
  if (platform === 'instagram') return <InstagramPreview {...rest} />;
  if (platform === 'tiktok') return <TikTokPreview {...rest} />;
  return <FacebookPreview {...rest} />;
}
