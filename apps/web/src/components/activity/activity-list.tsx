import { isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  type ActivityActorKey,
  type ActivityCursorValue,
  type ActivityView,
  buildActivityHref,
} from '../../lib/action-log-filters';
import { actionLabelKey } from '../../lib/action-log-format';
import { formatAbsoluteTime } from '../../lib/inbox-format';

export type ActivityListItem = {
  id: string;
  createdAt: Date;
  actorType: ActivityActorKey;
  actorName: string | null;
  action: string;
  targetType: string | null;
};

type ActivityT = Awaited<ReturnType<typeof getTranslations<'activity'>>>;

/** Tên hiển thị của người thực hiện: người dùng theo tên, loại khác theo nhãn loại; người đã rời thì "Thành viên cũ". */
export function actorDisplay(
  t: ActivityT,
  actorType: ActivityActorKey,
  actorName: string | null,
): string {
  if (actorType !== 'user') return t(`actors.${actorType}`);
  return actorName ?? t('actors.formerMember');
}

/** Danh sách dòng nhật ký (cột giữa). Chỉ hiển thị dữ liệu thật của `action_logs`. */
export async function ActivityList({
  view,
  items,
  nextCursor,
  timeZone,
}: {
  view: ActivityView;
  items: ActivityListItem[];
  nextCursor: ActivityCursorValue | null;
  timeZone: string;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('activity'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  return (
    <>
      <ul className="inbox-items" aria-label={t('list.label')}>
        {items.map((item) => {
          const key = actionLabelKey(item.action);
          return (
            <li key={item.id} className="inbox-item">
              <Link
                href={buildActivityHref(view, { selected: item.id })}
                className="inbox-item-link"
                aria-current={view.selected === item.id ? 'true' : undefined}
              >
                <div className="inbox-item-head">
                  <span className="inbox-author">
                    {key ? t(`actions.${key as 'workspace.created'}`) : item.action}
                  </span>
                  <time className="inbox-time" dateTime={item.createdAt.toISOString()}>
                    {formatAbsoluteTime(item.createdAt, locale, timeZone)}
                  </time>
                </div>
                <div className="inbox-source">
                  {actorDisplay(t, item.actorType, item.actorName)}
                  {item.targetType ? ` · ${item.targetType}` : ''}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <footer className="inbox-footer">
        <span>{t('list.shown', { shown: items.length })}</span>
        <span className="inbox-pager">
          {view.cursor ? (
            <Link href={buildActivityHref(view, { cursor: null })}>{t('list.first')}</Link>
          ) : null}
          {nextCursor ? (
            <Link href={buildActivityHref(view, { cursor: nextCursor })}>{t('list.next')}</Link>
          ) : null}
        </span>
      </footer>
    </>
  );
}
