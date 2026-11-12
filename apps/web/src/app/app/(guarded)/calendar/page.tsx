import { isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { PostDrawer } from '../../../../components/calendar/post-drawer';
import { PublishDrawer } from '../../../../components/calendar/publish-drawer';
import { WeekBoard } from '../../../../components/calendar/week-board';
import { NoticeBanner } from '../../../../components/composer/notice-banner';
import { Icon, type IconName } from '../../../../components/ui/icon';
import {
  groupByDay,
  parsePlatformFilter,
  platformCounts,
  weekTotals,
} from '../../../../lib/calendar-view';
import {
  calendarHref,
  resolveWeek,
  shiftWeek,
  todayIn,
  weekDays,
} from '../../../../lib/calendar-week';
import { cx } from '../../../../lib/cx';
import { COMPOSER_PLATFORMS } from '../../../../lib/post-counters';
import { parsePublishNotice } from '../../../../lib/publish-notice';
import { loadCalendar } from '../../../../server/post-calendar';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('calendar');
  return { title: t('title') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const softBtn =
  'inline-flex items-center gap-space-xs rounded-lg px-space-md py-space-sm font-title-sm text-title-sm';
const VIEW_TABS: ReadonlyArray<{ key: 'week' | 'table' | 'kanban'; icon: IconName }> = [
  { key: 'week', icon: 'calendar_view_week' },
  { key: 'table', icon: 'table_rows' },
  { key: 'kanban', icon: 'view_kanban' },
];
const KPI: ReadonlyArray<{ key: 'posts' | 'comments' | 'pending'; icon: IconName }> = [
  { key: 'posts', icon: 'post_add' },
  { key: 'comments', icon: 'chat' },
  { key: 'pending', icon: 'mark_chat_read' },
];
const PLATFORM_FILTER_ICON: Record<string, IconName> = {
  facebook: 'public',
  instagram: 'photo_camera',
  tiktok: 'music_note',
};

const dayLabel = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Trang Lịch đăng (COMPOSER-CALENDAR-UI, Q-CMP1): CHỈ Owner (Staff nhận 404). Lưới tuần theo design/stitch/calendar.html với bài THẬT của cửa hàng (đã đăng); lên lịch/bản nháp chưa có.
 * Tuần, bài đang mở và bộ lọc nền tảng là tham số URL (GET, dùng được khi tắt JavaScript); workspace/người dùng lấy từ `requireAppUser`, không từ URL.
 */
export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, params, rawLocale] = await Promise.all([
    getTranslations('calendar'),
    searchParams,
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';

  // Múi giờ workspace chỉ biết sau khi đọc DB; tuần mặc định cần "hôm nay" theo múi giờ đó → đọc một lần với tuần tạm rồi dựng lại nếu cần.
  const requested = first(params.w);
  let data: Awaited<ReturnType<typeof loadCalendar>> | null = null;
  let weekStart = resolveWeek(requested, todayIn('UTC'));
  try {
    data = await loadCalendar(workspace.id, user.id, weekStart);
    const today = todayIn(data.timeZone);
    const exact = resolveWeek(requested, today);
    if (exact !== weekStart) {
      weekStart = exact;
      data = await loadCalendar(workspace.id, user.id, weekStart);
    }
  } catch {
    data = null; // Không lộ chi tiết lỗi ra giao diện.
  }
  if (!data) {
    return (
      <main className="app-page" role="alert">
        <div className="tw">
          <h1 className="font-headline-md text-headline-md text-on-surface">{t('error.title')}</h1>
          <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
            {t('error.body')}
          </p>
        </div>
      </main>
    );
  }

  const today = todayIn(data.timeZone);
  const days = weekDays(weekStart);
  const platform = parsePlatformFilter(first(params.p));
  const counts = platformCounts(data.posts);
  const visible = platform ? data.posts.filter((post) => post.platform === platform) : data.posts;
  const totals = weekTotals(visible);
  const byDay = groupByDay(visible, days);
  // Bài đăng từ CommentFlow chỉ lên Facebook: lọc nền tảng khác Facebook thì ẩn.
  const publishVisible =
    !platform || platform === 'facebook'
      ? data.publish.filter((item): item is typeof item & { day: string } => item.day !== null)
      : [];
  const publishByDay = groupByDay(publishVisible, days);
  const openId = first(params.post);
  const openPost = visible.find((post) => post.id === openId);
  const openPublish = publishVisible.find((item) => item.id === openId);
  const notice = parsePublishNotice(params.n);
  const hrefWith = (over: { week?: string; platform?: string | undefined }) =>
    calendarHref({
      week: over.week ?? weekStart,
      ...(over.platform !== undefined || platform ? { platform: over.platform ?? platform } : {}),
    });
  const thisWeek = resolveWeek(undefined, today);

  return (
    <main className="app-page app-page-wide">
      <div className="tw">
        <div className="space-y-space-lg">
          {notice ? <NoticeBanner code={notice} /> : null}
          <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
            <div className="space-y-space-xs">
              <h1 className="font-headline-md text-headline-md tracking-tight text-on-surface">
                {t('heading')}
              </h1>
              <p className="max-w-2xl font-body-md text-body-md text-on-surface-variant">
                {t('subtitle')}
              </p>
            </div>
            <Link
              href="/app/composer"
              className={cx(
                softBtn,
                'bg-primary-container font-bold text-on-primary hover:bg-primary',
              )}
            >
              <Icon name="add_circle" size={18} />
              {t('nav.create')}
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-space-md">
            <div
              role="tablist"
              aria-label={t('views.label')}
              className="flex items-center gap-1 rounded-lg bg-surface-container-low p-1"
            >
              {VIEW_TABS.map(({ key, icon }) => {
                const active = key === 'week';
                return (
                  <span
                    key={key}
                    role="tab"
                    aria-selected={active}
                    aria-disabled={active ? undefined : 'true'}
                    title={active ? undefined : t('soon')}
                    tabIndex={active ? 0 : -1}
                    className={cx(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-title-sm text-title-sm',
                      active
                        ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                        : 'cursor-not-allowed text-on-surface-variant opacity-60',
                    )}
                  >
                    <Icon name={icon} size={16} />
                    {t(`views.${key}`)}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-space-sm">
              <Link
                href={hrefWith({ week: shiftWeek(weekStart, -1) })}
                aria-label={t('nav.prev')}
                title={t('nav.prev')}
                className="rounded-lg bg-surface-container-low p-2 text-on-surface hover:bg-surface-container"
              >
                <Icon name="chevron_left" size={18} />
              </Link>
              <span className="flex items-center gap-1 font-title-sm text-title-sm font-semibold text-on-surface">
                <Icon name="event" size={16} />
                {t('nav.range', {
                  from: dayLabel(days[0] ?? weekStart),
                  to: `${dayLabel(days[6] ?? weekStart)}/${(days[6] ?? weekStart).slice(0, 4)}`,
                })}
              </span>
              <Link
                href={hrefWith({ week: shiftWeek(weekStart, 1) })}
                aria-label={t('nav.next')}
                title={t('nav.next')}
                className="rounded-lg bg-surface-container-low p-2 text-on-surface hover:bg-surface-container"
              >
                <Icon name="chevron_right" size={18} />
              </Link>
              <Link
                href={hrefWith({ week: thisWeek })}
                className="rounded-lg bg-surface-container-low px-space-md py-2 font-title-sm text-title-sm text-primary hover:bg-surface-container"
              >
                {t('nav.today')}
              </Link>
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
            {KPI.map(({ key, icon }) => (
              <li
                key={key}
                className="flex items-center gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-primary-fixed text-primary">
                  <Icon name={icon} size={20} />
                </span>
                <div>
                  <div className="font-headline-md text-headline-md text-on-surface">
                    {totals[key]}
                  </div>
                  <div className="font-label-md text-label-md text-on-surface-variant">
                    {t(`kpi.${key}`)}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <nav
            aria-label={t('filter.label')}
            className="flex flex-wrap items-center gap-space-sm rounded-xl bg-surface-container-lowest p-space-sm shadow-sm"
          >
            <Link
              href={calendarHref({ week: weekStart })}
              aria-current={platform ? undefined : 'true'}
              className={cx(
                'rounded-full px-space-md py-1 font-label-md text-label-md',
                platform
                  ? 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  : 'bg-primary-container text-on-primary',
              )}
            >
              {t('filter.all', { count: counts.all })}
            </Link>
            {COMPOSER_PLATFORMS.map((name) => (
              <Link
                key={name}
                href={calendarHref({ week: weekStart, platform: name })}
                aria-current={platform === name ? 'true' : undefined}
                className={cx(
                  'flex items-center gap-1 rounded-full px-space-md py-1 font-label-md text-label-md',
                  platform === name
                    ? 'bg-primary-container text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                )}
              >
                <Icon name={PLATFORM_FILTER_ICON[name] ?? 'feed'} size={14} />
                {t(`filter.${name}`, { count: counts[name] })}
              </Link>
            ))}
          </nav>

          {visible.length + publishVisible.length === 0 ? (
            <div className="rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
              <h2 className="font-title-md text-title-md text-on-surface">{t('empty.title')}</h2>
              <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
                {t('empty.body')}
              </p>
            </div>
          ) : null}
          <WeekBoard
            days={days}
            today={today}
            weekStart={weekStart}
            platform={platform}
            openPostId={openPost?.id ?? openPublish?.id}
            byDay={byDay}
            publishByDay={publishByDay}
          />
          <section
            aria-label={t('drafts.title')}
            className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
          >
            <h2 className="mb-space-sm flex items-center gap-space-xs font-title-md text-title-md font-semibold text-on-surface">
              <Icon name="draft" size={18} />
              {t('drafts.title')} ({data.drafts.length})
            </h2>
            {data.drafts.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t('drafts.empty')}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-space-sm md:grid-cols-2 lg:grid-cols-3">
                {data.drafts.map((draft) => (
                  <li key={draft.id}>
                    <Link
                      href={`/app/composer?id=${draft.id}`}
                      className="flex h-full flex-col gap-1 rounded-lg bg-surface-container-low p-space-sm hover:bg-surface-container"
                    >
                      <span className="line-clamp-2 font-body-sm text-body-sm text-on-surface">
                        {draft.message === '' ? t('drafts.untitled') : draft.message}
                      </span>
                      <span className="font-label-sm text-label-sm text-primary">
                        {t('drafts.edit')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        {openPublish ? (
          <PublishDrawer
            post={openPublish}
            closeHref={hrefWith({})}
            locale={locale}
            timeZone={data.timeZone}
          />
        ) : null}
        {openPost ? (
          <PostDrawer
            post={openPost}
            closeHref={hrefWith({})}
            locale={locale}
            timeZone={data.timeZone}
          />
        ) : null}
      </div>
    </main>
  );
}
