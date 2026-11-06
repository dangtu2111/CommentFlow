import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ACTIVITY_ACTOR_KEYS,
  ACTIVITY_BASE_PATH,
  type ActivityView,
} from '../../lib/action-log-filters';
import { actionLabelKey } from '../../lib/action-log-format';

/** Lọc bằng GET form (không cần JavaScript); gửi form tạo URL mới, không mang con trỏ phân trang. */
export async function ActivityToolbar({
  view,
  actions,
  showActor,
}: {
  view: ActivityView;
  actions: string[];
  /** Staff chỉ có dòng của chính mình nên không cần lọc theo loại tác nhân. */
  showActor: boolean;
}) {
  const t = await getTranslations('activity');
  const hasFilter = Boolean(view.actorType || view.action || view.fromDate || view.toDate);
  const actionOptions =
    view.action && !actions.includes(view.action) ? [view.action, ...actions] : actions;
  return (
    <form className="inbox-toolbar" method="get" aria-label={t('toolbar.label')}>
      {showActor ? (
        <label className="inbox-field">
          <span>{t('toolbar.actor')}</span>
          <select name="actor" defaultValue={view.actorType ?? ''}>
            <option value="">{t('toolbar.allActors')}</option>
            {ACTIVITY_ACTOR_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`actors.${key}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="inbox-field">
        <span>{t('toolbar.action')}</span>
        <select name="action" defaultValue={view.action ?? ''}>
          <option value="">{t('toolbar.allActions')}</option>
          {actionOptions.map((action) => {
            const key = actionLabelKey(action);
            return (
              <option key={action} value={action}>
                {key ? t(`actions.${key as 'workspace_created'}`) : action}
              </option>
            );
          })}
        </select>
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.from')}</span>
        <input type="date" name="from" defaultValue={view.fromDate ?? ''} />
      </label>
      <label className="inbox-field">
        <span>{t('toolbar.to')}</span>
        <input type="date" name="to" defaultValue={view.toDate ?? ''} />
      </label>
      <div className="inbox-toolbar-actions">
        <button type="submit" className="btn btn-primary">
          {t('toolbar.apply')}
        </button>
        {hasFilter ? (
          <Link href={ACTIVITY_BASE_PATH} className="inbox-clear">
            {t('toolbar.clear')}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
