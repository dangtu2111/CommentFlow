import type { CalendarPost } from '@flow/db/runtime';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { calendarHref } from '../../lib/calendar-week';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from '../ui/icon';

/**
 * Lưới tuần 7 cột của Lịch đăng (design/stitch/calendar.html). Chỉ BÀI THẬT (đã đăng) đặt đúng ngày/giờ theo múi giờ workspace; chưa có bản nháp/lên lịch nên ô trống chỉ ghi
 * "Không có bài". Chọn bài = liên kết `?post=` (server render khung chi tiết, dùng được khi tắt JavaScript). Chỉ dùng bên trong `.tw`.
 */
const PLATFORM_ICON: Record<string, IconName> = {
  facebook: 'public',
  instagram: 'photo_camera',
  tiktok: 'music_note',
};
const DEFAULT_ICON: IconName = 'feed';

const dayLabel = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function WeekBoard({
  days,
  today,
  weekStart,
  platform,
  openPostId,
  byDay,
}: {
  days: string[];
  today: string;
  weekStart: string;
  platform: string | undefined;
  openPostId: string | undefined;
  byDay: Record<string, CalendarPost[]>;
}) {
  const t = await getTranslations('calendar');
  return (
    <div className="overflow-x-auto">
      <ol className="grid min-w-[56rem] grid-cols-7 gap-space-sm">
        {days.map((day, index) => {
          const isToday = day === today;
          const posts = byDay[day] ?? [];
          return (
            <li
              key={day}
              aria-current={isToday ? 'date' : undefined}
              className={cx(
                'flex min-h-48 flex-col gap-space-sm rounded-xl p-space-sm',
                isToday ? 'bg-primary-fixed/40 shadow-sm' : 'bg-surface-container-lowest shadow-sm',
              )}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span
                  className={cx(
                    'font-title-sm text-title-sm font-semibold',
                    isToday ? 'text-primary' : 'text-on-surface',
                  )}
                >
                  {t(`weekday.${index}`)}
                </span>
                <span className="font-label-md text-label-md text-on-surface-variant">
                  {dayLabel(day)}
                </span>
              </div>
              {isToday ? (
                <span className="w-fit rounded-full bg-primary-container px-2 py-0.5 font-label-sm text-label-sm text-on-primary">
                  {t('today')}
                </span>
              ) : null}
              {posts.length === 0 ? (
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {t('emptyDay')}
                </p>
              ) : (
                <ul className="flex flex-col gap-space-xs">
                  {posts.map((post) => {
                    const open = post.id === openPostId;
                    return (
                      <li key={post.id}>
                        <Link
                          href={calendarHref({
                            week: weekStart,
                            post: post.id,
                            ...(platform ? { platform } : {}),
                          })}
                          aria-current={open ? 'true' : undefined}
                          className={cx(
                            'flex flex-col gap-1 rounded-lg p-space-sm transition-colors',
                            open
                              ? 'bg-secondary-fixed'
                              : 'bg-surface-container-low hover:bg-surface-container',
                          )}
                        >
                          <span className="flex items-center justify-between gap-1 font-label-sm text-label-sm text-on-surface-variant">
                            <span className="flex items-center gap-1">
                              <Icon name={PLATFORM_ICON[post.platform] ?? DEFAULT_ICON} size={14} />
                              {post.time}
                            </span>
                            <span className="whitespace-nowrap rounded bg-surface-container-high px-1.5 py-0.5 text-on-surface">
                              {post.isAd ? t('ad') : t('status.published')}
                            </span>
                          </span>
                          <span
                            className={cx(
                              'line-clamp-2 font-body-sm text-body-sm',
                              post.message ? 'text-on-surface' : 'italic text-on-surface-variant',
                            )}
                          >
                            {post.message ?? t('noContent')}
                          </span>
                          <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                            <Icon name="chat" size={12} />
                            {t('comments', { count: post.commentCount })}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                href="/app/composer"
                className="mt-auto inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:underline"
              >
                <Icon name="add" size={12} />
                {t('add')}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
