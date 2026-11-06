import { KB_GAP_STATUSES, KB_GAP_TOPICS } from '@flow/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbGapRow } from '../../../../components/kb-gaps/kb-gap-row';
import { groupGapsByTopic, parseKbGapFilter, toKbGapViews } from '../../../../lib/kb-gaps-form';
import { kbGaps } from '../../../../server/kb-gaps';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('kbGaps'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Câu hỏi AI chưa trả lời được (FR-134, UF-11, US-106): chỉ Owner (Staff nhận 404). Đọc `kb_gaps` của workspace
 * đang chọn qua `withActor`; bộ lọc chủ đề/trạng thái từ URL được kiểm chặt.
 */
export default async function KbGapsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, filter] = await Promise.all([
    getTranslations('kbGaps'),
    searchParams.then(parseKbGapFilter),
  ]);

  let gaps: Awaited<ReturnType<ReturnType<typeof kbGaps>['list']>> | null = null;
  try {
    gaps = await kbGaps().list({ workspaceId: workspace.id, userId: user.id }, filter);
  } catch {
    gaps = null; // không lộ chi tiết lỗi ra giao diện
  }
  if (!gaps) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('loadError.title')}</h1>
        <p className="muted">{t('loadError.body')}</p>
      </main>
    );
  }

  const groups = groupGapsByTopic(toKbGapViews(gaps));
  const href = (patch: { topic?: string; status?: string }) => {
    const q = new URLSearchParams();
    const topic = 'topic' in patch ? patch.topic : filter.topic;
    if (topic) q.set('topic', topic);
    q.set('status', patch.status ?? filter.status);
    return `/app/kb-gaps?${q.toString()}`;
  };

  return (
    <main className="app-page app-page-kb">
      <KbFrame active="kbGaps">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
        <nav aria-label={t('filterLabel')} className="row">
          {KB_GAP_STATUSES.map((s) => (
            <Link
              key={s}
              href={href({ status: s })}
              aria-current={filter.status === s ? 'page' : undefined}
            >
              {t(`status.${s}`)}
            </Link>
          ))}
          <span className="muted">·</span>
          <Link href={href({ topic: '' })} aria-current={filter.topic ? undefined : 'page'}>
            {t('allTopics')}
          </Link>
          {KB_GAP_TOPICS.map((topic) => (
            <Link
              key={topic}
              href={href({ topic })}
              aria-current={filter.topic === topic ? 'page' : undefined}
            >
              {t(`topic.${topic}`)}
            </Link>
          ))}
        </nav>
        {groups.length === 0 ? (
          <p className="muted">{t('empty')}</p>
        ) : (
          groups.map((group) => (
            <section key={group.topic} className="stack">
              <h2>{t('groupTitle', { topic: t(`topic.${group.topic}`), total: group.total })}</h2>
              <ul className="stack">
                {group.gaps.map((gap) => (
                  <KbGapRow key={gap.id} gap={gap} />
                ))}
              </ul>
            </section>
          ))
        )}
      </KbFrame>
    </main>
  );
}
