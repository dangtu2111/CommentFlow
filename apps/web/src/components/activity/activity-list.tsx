import { isLocale } from '@flow/shared';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  type ActivityActorKey,
  type ActivityCursorValue,
  type ActivityView,
  buildActivityHref,
} from '../../lib/action-log-filters';
import { actionLabelKey, onBehalfOfDisplay } from '../../lib/action-log-format';
import { formatAbsoluteTime, toIsoString } from '../../lib/inbox-format';
import { type ActivityTone, activityTone } from '../../lib/settings-visual';
import { userInitials } from '../../lib/user-initials';
import { Icon, type IconName } from '../ui/icon';
import { Badge } from '../ui/tw-parts';

/** Cột mẫu `[MẪU]` của HTML Stitch (kênh, tóm tắt payload, kết quả) — dòng thật chưa có các trường này. */
export type ActivitySampleExtra = {
  channel: string;
  channelDot: 'primary' | 'secondary' | 'outline';
  post?: string;
  payload: string;
  payloadSub?: string;
  failed?: boolean;
  result: string;
};

export type ActivityListItem = {
  id: string;
  createdAt: Date;
  actorType: ActivityActorKey;
  actorName: string | null;
  onBehalfOfId: string | null;
  onBehalfOfName: string | null;
  action: string;
  targetType: string | null;
  sample?: ActivitySampleExtra;
};

type ActivityT = Awaited<ReturnType<typeof getTranslations<'activity'>>>;

const DASH = '—';
const DOT = { primary: 'bg-primary-container', secondary: 'bg-secondary', outline: 'bg-outline' };

/** Tông huy hiệu + biểu tượng cho nhóm hành động (theo `activityTone`). */
export const ACTION_LOOK: Record<
  ActivityTone,
  { tone: 'error' | 'secondary' | 'strong' | 'tertiary'; icon: IconName }
> = {
  moderation: { tone: 'error', icon: 'visibility_off' },
  reply: { tone: 'secondary', icon: 'send' },
  team: { tone: 'strong', icon: 'groups' },
  channel: { tone: 'tertiary', icon: 'hub' },
  neutral: { tone: 'strong', icon: 'history' },
};

/**
 * Tên hiển thị của người thực hiện: người dùng theo tên, loại khác theo nhãn loại; người đã rời thì "Thành viên cũ".
 * Dòng hệ thống có người yêu cầu: "Hệ thống (theo yêu cầu của bạn / của <tên>)".
 */
export function actorDisplay(
  t: ActivityT,
  item: Pick<ActivityListItem, 'actorType' | 'actorName' | 'onBehalfOfId' | 'onBehalfOfName'>,
  viewerId: string,
): string {
  if (item.actorType === 'system') {
    const onBehalf = onBehalfOfDisplay(item.onBehalfOfId, item.onBehalfOfName, viewerId);
    if (onBehalf?.kind === 'self') return t('actors.systemOnBehalf.self');
    if (onBehalf?.kind === 'named')
      return t('actors.systemOnBehalf.named', { name: onBehalf.name });
    if (onBehalf?.kind === 'former') return t('actors.systemOnBehalf.former');
  }
  if (item.actorType !== 'user') return t(`actors.${item.actorType}`);
  return item.actorName ?? t('actors.formerMember');
}

/** Tác nhân: AI → viên tím có biểu tượng; người dùng → chữ viết tắt; hệ thống/quản trị → biểu tượng (không ảnh thật). */
export function ActorCell({ item, name }: { item: ActivityListItem; name: string }) {
  if (item.actorType === 'ai') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-secondary-fixed px-2 py-1 font-title-sm text-title-sm text-on-secondary-fixed shadow-sm">
        <span className="text-secondary">
          <Icon name="smart_toy" size={14} />
        </span>
        {name}
      </span>
    );
  }
  if (item.actorType === 'user') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-tertiary-fixed font-label-sm text-label-sm text-on-tertiary-fixed">
          {userInitials(name)}
        </span>
        <span className="font-title-sm text-title-sm text-on-surface">{name}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <Icon name={item.actorType === 'admin' ? 'verified_user' : 'settings'} size={14} />
      </span>
      <span className="font-title-sm text-title-sm text-on-surface">{name}</span>
    </div>
  );
}

/** Bảng nhật ký (design/stitch/activity-log.html): 7 cột; dòng thật chỉ điền thời gian/tác nhân/hành động/đối tượng. */
export async function ActivityList({
  view,
  items,
  nextCursor,
  timeZone,
  viewerId,
}: {
  view: ActivityView;
  items: ActivityListItem[];
  nextCursor: ActivityCursorValue | null;
  timeZone: string;
  viewerId: string;
}) {
  const [t, rawLocale] = await Promise.all([getTranslations('activity'), getLocale()]);
  const locale = isLocale(rawLocale) ? rawLocale : 'vi';
  const cols = [
    'table.time',
    'table.actor',
    'table.action',
    'table.target',
    'table.payload',
    'table.result',
  ] as const;
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm xl:flex-1">
      <div className="overflow-x-auto">
        <table className="w-full text-left" aria-label={t('list.label')}>
          <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            <tr>
              {cols.map((key) => (
                <th key={key} scope="col" className="px-space-md py-3 font-semibold">
                  {t(key)}
                </th>
              ))}
              <th scope="col" className="px-space-md py-3 text-right font-semibold">
                {t('table.detail')}
              </th>
            </tr>
          </thead>
          <tbody className="font-body-sm text-body-sm text-on-surface">
            {items.map((item) => {
              const key = actionLabelKey(item.action);
              const name = actorDisplay(t, item, viewerId);
              const look = ACTION_LOOK[activityTone(item.action)];
              const selected = view.selected === item.id;
              const href = buildActivityHref(view, { selected: item.id });
              const date = formatAbsoluteTime(item.createdAt, locale, timeZone);
              const extra = item.sample;
              return (
                <tr
                  key={item.id}
                  aria-current={selected ? 'true' : undefined}
                  className={
                    selected
                      ? 'bg-surface-container-low transition-colors hover:bg-surface-container'
                      : 'transition-colors hover:bg-surface-container-low'
                  }
                >
                  <td className="whitespace-nowrap px-space-md py-3">
                    <time
                      dateTime={toIsoString(item.createdAt)}
                      className="font-title-sm text-title-sm font-semibold text-on-surface"
                    >
                      {date}
                    </time>
                  </td>
                  <td className="whitespace-nowrap px-space-md py-3">
                    <ActorCell item={item} name={name} />
                  </td>
                  <td className="whitespace-nowrap px-space-md py-3">
                    <Badge tone={look.tone} className="font-semibold">
                      <Icon name={look.icon} size={12} />
                      {key ? t(`actions.${key as 'workspace_created'}`) : item.action}
                    </Badge>
                  </td>
                  <td className="px-space-md py-3">
                    {extra ? (
                      <>
                        <div className="flex max-w-[180px] items-center gap-1 truncate font-title-sm text-title-sm text-on-surface">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${DOT[extra.channelDot]}`}
                          />
                          {extra.channel}
                        </div>
                        {extra.post ? (
                          <div className="max-w-[180px] truncate font-label-sm text-label-sm text-on-surface-variant">
                            {extra.post}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="font-title-sm text-title-sm text-on-surface">
                        {item.targetType ?? t('table.noTarget')}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[240px] px-space-md py-3">
                    <div
                      className={`truncate font-body-sm text-body-sm ${extra?.failed ? 'font-medium text-error' : 'font-medium'}`}
                    >
                      {extra?.payload ?? DASH}
                    </div>
                    {extra?.payloadSub ? (
                      <div className="truncate font-label-sm text-label-sm text-on-surface-variant">
                        {extra.payloadSub}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-space-md py-3">
                    {extra ? (
                      <Badge
                        tone={extra.failed ? 'error' : 'strong'}
                        className={`font-semibold ${extra.failed ? '' : 'text-primary'}`}
                      >
                        {extra.failed ? (
                          <Icon name="error" size={12} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
                        )}
                        {extra.result}
                      </Badge>
                    ) : (
                      DASH
                    )}
                  </td>
                  <td className="whitespace-nowrap px-space-md py-3 text-right">
                    <Link
                      href={href}
                      className={
                        selected
                          ? 'rounded bg-primary-container px-2.5 py-1 font-label-sm text-label-sm text-on-primary shadow-sm transition-colors hover:bg-primary'
                          : 'rounded bg-surface-container px-2.5 py-1 font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-container-high'
                      }
                    >
                      {selected ? t('table.viewLog') : t('table.detail')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low p-space-md font-label-sm text-label-sm text-on-surface-variant">
        <span>{t('list.shown', { shown: items.length })}</span>
        <span className="flex items-center gap-1">
          {view.cursor ? (
            <Link
              href={buildActivityHref(view, { cursor: null })}
              className="flex items-center gap-0.5 rounded px-2 py-1 font-title-sm text-title-sm text-on-surface hover:bg-surface-container"
            >
              <Icon name="first_page" size={16} />
              {t('list.first')}
            </Link>
          ) : null}
          {nextCursor ? (
            <Link
              href={buildActivityHref(view, { cursor: nextCursor })}
              className="flex items-center gap-0.5 rounded px-2 py-1 font-title-sm text-title-sm text-on-surface hover:bg-surface-container"
            >
              {t('list.next')}
              <Icon name="chevron_right" size={16} />
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
