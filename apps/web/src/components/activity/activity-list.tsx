import { isLocale } from '@flow/shared';
import { Cog, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  type ActivityActorKey,
  type ActivityCursorValue,
  type ActivityView,
  buildActivityHref,
} from '../../lib/action-log-filters';
import { actionLabelKey, onBehalfOfDisplay } from '../../lib/action-log-format';
import { formatAbsoluteTime } from '../../lib/inbox-format';
import { activityTone } from '../../lib/settings-visual';
import { userInitials } from '../../lib/user-initials';
import { Avatar } from '../ui/avatar';
import { DataTable } from '../ui/data-table';

export type ActivityListItem = {
  id: string;
  createdAt: Date;
  actorType: ActivityActorKey;
  actorName: string | null;
  onBehalfOfId: string | null;
  onBehalfOfName: string | null;
  action: string;
  targetType: string | null;
};

type ActivityT = Awaited<ReturnType<typeof getTranslations<'activity'>>>;

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

/** Ảnh đại diện của tác nhân: người dùng → chữ viết tắt; AI/hệ thống/quản trị → biểu tượng (không logo, không ảnh thật). */
function ActorAvatar({ item, name }: { item: ActivityListItem; name: string }) {
  if (item.actorType === 'user') {
    return <Avatar size="sm">{userInitials(name)}</Avatar>;
  }
  const Icon = item.actorType === 'ai' ? Sparkles : item.actorType === 'admin' ? ShieldCheck : Cog;
  return (
    <Avatar size="sm" ai={item.actorType === 'ai'}>
      <Icon size={16} />
    </Avatar>
  );
}

/** Danh sách dòng nhật ký (cột giữa). Chỉ hiển thị dữ liệu thật của `action_logs`. */
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
  return (
    <>
      <DataTable
        label={t('list.label')}
        columns={[
          { label: t('table.time') },
          { label: t('table.actor') },
          { label: t('table.action') },
          { label: t('table.target') },
        ]}
      >
        {items.map((item) => {
          const key = actionLabelKey(item.action);
          const name = actorDisplay(t, item, viewerId);
          return (
            <tr key={item.id} aria-current={view.selected === item.id ? 'true' : undefined}>
              <td>
                <Link
                  href={buildActivityHref(view, { selected: item.id })}
                  className="log-row-link"
                >
                  <time dateTime={item.createdAt.toISOString()}>
                    {formatAbsoluteTime(item.createdAt, locale, timeZone)}
                  </time>
                </Link>
              </td>
              <td>
                <span className="log-actor">
                  <ActorAvatar item={item} name={name} />
                  {name}
                </span>
              </td>
              <td>
                <span className={`chip chip-tone-${activityTone(item.action)}`}>
                  {key ? t(`actions.${key as 'workspace_created'}`) : item.action}
                </span>
              </td>
              <td>{item.targetType ?? t('table.noTarget')}</td>
            </tr>
          );
        })}
      </DataTable>
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
