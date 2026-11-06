import { Lock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActivityDetailPanel } from '../../../../components/activity/activity-detail';
import { ActivityList, type ActivityListItem } from '../../../../components/activity/activity-list';
import { ActivityToolbar } from '../../../../components/activity/activity-toolbar';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';
import { parseActivitySearchParams } from '../../../../lib/action-log-filters';

const TZ = 'Asia/Ho_Chi_Minh';
const VIEWER = 'u1';
const SAMPLE_TARGET = 'sample-comment-1';
const SAMPLE_BEFORE = { is_hidden: false };
const SAMPLE_AFTER = { is_hidden: true };
const NOW = new Date('2026-11-06T10:30:00Z');
const at = (m: number) => new Date(NOW.getTime() - m * 60_000);

const ITEMS: ActivityListItem[] = [
  {
    id: 'a1',
    createdAt: at(2),
    actorType: 'ai',
    actorName: null,
    onBehalfOfId: null,
    onBehalfOfName: null,
    action: 'comment.hidden',
    targetType: 'comment',
  },
  {
    id: 'a2',
    createdAt: at(9),
    actorType: 'user',
    actorName: '[MẪU] Nguyễn Mai Linh',
    onBehalfOfId: null,
    onBehalfOfName: null,
    action: 'comment.reply_requested',
    targetType: 'comment',
  },
  {
    id: 'a3',
    createdAt: at(31),
    actorType: 'system',
    actorName: null,
    onBehalfOfId: 'u1',
    onBehalfOfName: '[MẪU] Nguyễn Mai Linh',
    action: 'comment.hide_requested',
    targetType: 'comment',
  },
  {
    id: 'a4',
    createdAt: at(75),
    actorType: 'user',
    actorName: '[MẪU] Trần Quốc Huy',
    onBehalfOfId: null,
    onBehalfOfName: null,
    action: 'member.role_changed',
    targetType: 'member',
  },
  {
    id: 'a5',
    createdAt: at(140),
    actorType: 'admin',
    actorName: null,
    onBehalfOfId: null,
    onBehalfOfName: null,
    action: 'channel.reconnected',
    targetType: 'channel',
  },
];

/** Trang xem giao diện Nhật ký với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`. */
export default async function DevActivityPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('activity');
  const view = parseActivitySearchParams({});
  const first = ITEMS[0];
  if (!first) notFound();
  return (
    <DevShell>
      <main className="log-page">
        <header className="log-header">
          <h1 className="page-title">{t('title')}</h1>
          <p>
            <span className="chip chip-muted">
              <Lock size={12} aria-hidden="true" /> {t('readOnly')}
            </span>
          </p>
          <p className="page-subtitle">{t('subtitle.owner')}</p>
          <p className="inbox-sample-note" role="note">
            {DEV_SAMPLE_NOTE}
          </p>
        </header>
        <section className="log-list" aria-label={t('list.label')}>
          <ActivityToolbar view={view} actions={[]} showActor />
          <ActivityList
            view={view}
            items={ITEMS}
            nextCursor={null}
            timeZone={TZ}
            viewerId={VIEWER}
          />
        </section>
        <aside className="log-detail" aria-label={t('detail.title')}>
          <ActivityDetailPanel
            entry={{
              ...first,
              targetId: SAMPLE_TARGET,
              before: SAMPLE_BEFORE,
              after: SAMPLE_AFTER,
            }}
            timeZone={TZ}
            viewerId={VIEWER}
          />
        </aside>
      </main>
    </DevShell>
  );
}
