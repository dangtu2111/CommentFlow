import { isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { actionLabelKey, diffRows } from '../../lib/action-log-format';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { type ActivityListItem, actorDisplay } from './activity-list';

export type ActivityDetail = ActivityListItem & {
  targetId: string | null;
  before: unknown;
  after: unknown;
};

/** Chi tiết một dòng nhật ký: thời điểm, người thực hiện, đối tượng và giá trị trước, sau. */
export async function ActivityDetailPanel({
  entry,
  timeZone,
  viewerId,
}: {
  entry: ActivityDetail;
  timeZone: string;
  viewerId: string;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('activity'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const key = actionLabelKey(entry.action);
  const rows = diffRows(entry.before, entry.after);
  return (
    <article className="log-detail-body">
      <h2>{key ? t(`actions.${key as 'workspace_created'}`) : entry.action}</h2>
      <p className="muted">{entry.action}</p>
      <dl className="log-meta">
        <dt>{t('detail.time')}</dt>
        <dd>{formatAbsoluteTime(entry.createdAt, locale, timeZone)}</dd>
        <dt>{t('detail.actor')}</dt>
        <dd>{actorDisplay(t, entry, viewerId)}</dd>
        {entry.targetType ? (
          <>
            <dt>{t('detail.target')}</dt>
            <dd>
              {entry.targetType}
              {entry.targetId ? ` · ${entry.targetId}` : ''}
            </dd>
          </>
        ) : null}
      </dl>
      <h3>{t('detail.changes')}</h3>
      {rows.length === 0 ? (
        <p className="muted">{t('detail.noChanges')}</p>
      ) : (
        <table className="log-diff">
          <thead>
            <tr>
              <th scope="col">{t('detail.field')}</th>
              <th scope="col">{t('detail.before')}</th>
              <th scope="col">{t('detail.after')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.changed ? 'log-diff-changed' : undefined}>
                <th scope="row">{row.key}</th>
                <td>{row.before ?? t('detail.none')}</td>
                <td>{row.after ?? t('detail.none')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
