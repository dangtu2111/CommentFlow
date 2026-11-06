import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ACTIVITY_ACTOR_KEYS,
  ACTIVITY_BASE_PATH,
  type ActivityView,
} from '../../lib/action-log-filters';
import { actionLabelKey } from '../../lib/action-log-format';
import { ACTIVITY_FILTER_SAMPLE } from '../../lib/activity-sample';
import { Icon } from '../ui/icon';
import { Badge, Panel } from '../ui/tw-parts';

const FIELD =
  'w-full rounded-lg bg-surface-container-low px-3 py-2 font-title-sm text-title-sm text-on-surface shadow-sm focus:outline-none';
const DISABLED = 'cursor-not-allowed opacity-70';

/**
 * Thanh lọc (design/stitch/activity-log.html): lọc THẬT bằng GET form (tác nhân, hành động, từ/đến ngày — không cần
 * JavaScript; gửi form tạo URL mới, không mang con trỏ phân trang) + ô tìm kiếm và bộ lọc kênh "Sắp có". Dải "Đang áp
 * dụng" dựng từ bộ lọc thật.
 */
export async function ActivityToolbar({
  view,
  actions,
  showActor,
  shown,
  sample,
}: {
  view: ActivityView;
  actions: string[];
  /** Staff chỉ có dòng của chính mình nên không cần lọc theo loại tác nhân. */
  showActor: boolean;
  shown: number;
  sample: boolean;
}) {
  const t = await getTranslations('activity');
  const soon = t('ui.soon');
  const hasFilter = Boolean(view.actorType || view.action || view.fromDate || view.toDate);
  const actionOptions =
    view.action && !actions.includes(view.action) ? [view.action, ...actions] : actions;
  const actionLabel = (action: string) => {
    const key = actionLabelKey(action);
    return key ? t(`actions.${key as 'workspace_created'}`) : action;
  };
  const tags: string[] = [
    ...(view.actorType ? [`${t('toolbar.actor')}: ${t(`actors.${view.actorType}`)}`] : []),
    ...(view.action ? [`${t('toolbar.action')}: ${actionLabel(view.action)}`] : []),
    ...(view.fromDate ? [`${t('toolbar.from')}: ${view.fromDate}`] : []),
    ...(view.toDate ? [`${t('toolbar.to')}: ${view.toDate}`] : []),
  ];
  return (
    <Panel className="flex flex-col gap-space-md">
      <form
        method="get"
        aria-label={t('toolbar.label')}
        className="grid grid-cols-1 items-center gap-space-sm lg:grid-cols-12"
      >
        <label className="relative lg:col-span-4">
          <span className="absolute left-3 top-2.5 text-on-surface-variant">
            <Icon name="search" size={16} />
          </span>
          <input
            type="text"
            disabled
            title={soon}
            defaultValue={sample ? ACTIVITY_FILTER_SAMPLE.search : ''}
            placeholder={t('ui.search')}
            aria-label={t('ui.search')}
            className={`w-full rounded-lg bg-surface-container-low py-2 pl-9 pr-3 font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-on-surface-variant ${DISABLED}`}
          />
        </label>
        {showActor ? (
          <label className="lg:col-span-2">
            <span className="sr-only">{t('toolbar.actor')}</span>
            <select name="actor" defaultValue={view.actorType ?? ''} className={FIELD}>
              <option value="">{t('toolbar.allActors')}</option>
              {ACTIVITY_ACTOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`actors.${key}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="lg:col-span-2">
          <span className="sr-only">{t('toolbar.action')}</span>
          <select name="action" defaultValue={view.action ?? ''} className={FIELD}>
            <option value="">{t('toolbar.allActions')}</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="sr-only">{t('ui.channel')}</span>
          <select
            disabled
            title={soon}
            aria-label={t('ui.channel')}
            className={`${FIELD} ${DISABLED}`}
          >
            <option>{t('ui.allChannels')}</option>
            {sample
              ? ACTIVITY_FILTER_SAMPLE.channels.map((c) => <option key={c}>{c}</option>)
              : null}
          </select>
        </label>
        <div className="flex items-center gap-space-xs lg:col-span-2">
          <label className="w-full">
            <span className="sr-only">{t('toolbar.from')}</span>
            <input type="date" name="from" defaultValue={view.fromDate ?? ''} className={FIELD} />
          </label>
          <label className="w-full">
            <span className="sr-only">{t('toolbar.to')}</span>
            <input type="date" name="to" defaultValue={view.toDate ?? ''} className={FIELD} />
          </label>
        </div>
        <div className="flex items-center gap-2 lg:col-span-12">
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-primary-container px-3 py-2 font-title-sm text-title-sm text-on-primary shadow-sm transition-colors hover:bg-primary"
          >
            <Icon name="filter_alt" size={16} />
            {t('toolbar.apply')}
          </button>
          {hasFilter ? (
            <Link
              href={ACTIVITY_BASE_PATH}
              title={t('toolbar.clear')}
              className="flex items-center gap-1 rounded-lg bg-surface-container-low p-2 font-title-sm text-title-sm text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <Icon name="filter_alt_off" size={16} />
              {t('toolbar.clear')}
            </Link>
          ) : null}
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 pt-1 font-label-sm text-label-sm text-on-surface-variant">
        <span>{t('ui.applied')}</span>
        {tags.length === 0 ? <span>{t('ui.noFilter')}</span> : null}
        {tags.map((tag) => (
          <Badge key={tag} tone="strong" className="font-medium">
            {tag}
          </Badge>
        ))}
        {hasFilter ? (
          <Link href={ACTIVITY_BASE_PATH} className="ml-1 text-primary hover:underline">
            {t('ui.clearAll')}
          </Link>
        ) : null}
        <span className="ml-auto">{t('ui.found', { n: shown })}</span>
      </div>
    </Panel>
  );
}
