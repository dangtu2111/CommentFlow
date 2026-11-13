import type { CalendarPost } from '@flow/db/runtime';
import type { Locale } from '@flow/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { safeHttpsUrl, safeHttpUrl } from '../../lib/safe-url';
import { Icon } from '../ui/icon';

/**
 * Khung chi tiết một bài (design/stitch/calendar.html "Post Inspector Drawer"): hiện khi URL có `?post=<id>`; server render, đóng bằng liên kết. Chỉ DỮ LIỆU THẬT của bài:
 * kênh, giờ đăng, nội dung, ảnh (https), số bình luận. "Hủy lịch"/"Chỉnh sửa bài" chưa có chức năng → vô hiệu kèm "Sắp có". Số tiếp cận, SKU, kịch bản AI trong thiết kế mẫu
 * không có dữ liệu thật nên không hiện. Chỉ dùng bên trong `.tw`.
 */
export async function PostDrawer({
  post,
  closeHref,
  locale,
  timeZone,
}: {
  post: CalendarPost;
  closeHref: string;
  locale: Locale;
  timeZone: string;
}) {
  const t = await getTranslations('calendar');
  const image = safeHttpsUrl(post.mediaUrl);
  const original = safeHttpUrl(post.permalink);
  const soon = t('soon');
  return (
    <>
      <Link
        href={closeHref}
        aria-label={t('drawer.close')}
        className="fixed inset-0 z-40 bg-inverse-surface/40"
      />
      <aside
        aria-label={t('drawer.title')}
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col gap-space-md overflow-y-auto bg-surface-container-lowest p-space-lg shadow-2xl"
      >
        <div className="flex items-center justify-between gap-space-sm">
          <h2 className="flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
            <Icon name="feed" size={20} />
            {t('drawer.title')}
          </h2>
          <Link
            href={closeHref}
            aria-label={t('drawer.close')}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="close" size={20} />
          </Link>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-space-md gap-y-space-xs rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm">
          <dt className="text-on-surface-variant">{t('drawer.channel')}</dt>
          <dd className="font-semibold text-on-surface">{post.channelName}</dd>
          <dt className="text-on-surface-variant">{t('drawer.time')}</dt>
          <dd className="text-on-surface">
            {formatAbsoluteTime(post.createdTime, locale, timeZone)}
          </dd>
        </dl>

        <section className="flex flex-col gap-space-xs">
          <h3 className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            {t('drawer.content')}
          </h3>
          {image ? (
            // biome-ignore lint/performance/noImgElement: ảnh CDN của nền tảng (không qua next/image, tên miền do CSP kiểm soát)
            <img
              src={image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="max-h-64 w-full rounded-lg object-cover"
            />
          ) : null}
          <p className="whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface">
            {post.message ?? (
              <span className="text-on-surface-variant">{t('drawer.noContent')}</span>
            )}
          </p>
        </section>

        <section className="flex flex-col gap-space-xs">
          <h3 className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            {t('drawer.stats')}
          </h3>
          <div className="grid grid-cols-2 gap-space-sm">
            <div className="rounded-lg bg-surface-container-low p-space-md">
              <div className="font-headline-md text-headline-md text-on-surface">
                {post.commentCount}
              </div>
              <div className="font-label-sm text-label-sm text-on-surface-variant">
                {t('drawer.comments')}
              </div>
            </div>
            <div className="rounded-lg bg-surface-container-low p-space-md">
              <div className="font-headline-md text-headline-md text-on-surface">
                {post.pendingCount}
              </div>
              <div className="font-label-sm text-label-sm text-on-surface-variant">
                {t('drawer.pending')}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-auto flex flex-wrap items-center gap-space-sm">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={soon}
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg bg-surface-container-high px-space-md py-space-sm font-title-sm text-title-sm opacity-60"
          >
            <Icon name="event_busy" size={16} />
            {t('drawer.cancel')}
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={soon}
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg bg-surface-container-high px-space-md py-space-sm font-title-sm text-title-sm opacity-60"
          >
            <Icon name="edit" size={16} />
            {t('drawer.edit')}
          </button>
          <Link
            href="/app/comments"
            className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-space-md py-space-sm font-title-sm text-title-sm text-on-primary hover:bg-primary"
          >
            <Icon name="chat" size={16} />
            {t('drawer.openComments')}
          </Link>
          {original ? (
            <a
              href={original}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-surface-container-low px-space-md py-space-sm font-title-sm text-title-sm text-primary hover:bg-surface-container"
            >
              <Icon name="open_in_new" size={16} />
              {t('drawer.openOriginal')}
            </a>
          ) : null}
        </div>
      </aside>
    </>
  );
}
