import { KB_GAP_STATUSES, KB_GAP_TOPICS } from '@flow/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KbPageHead } from '../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { DraftFaqRow } from '../../../../components/kb-gaps/draft-faq-row';
import { KbGapRow } from '../../../../components/kb-gaps/kb-gap-row';
import { groupGapsByTopic, parseKbGapFilter, toKbGapViews } from '../../../../lib/kb-gaps-form';
import { hasNewCard } from '../../../../lib/kb-gaps-links';
import { getBrand } from '../../../../server/brand';
import { distillDrafts } from '../../../../server/distill-drafts';
import { kbGaps } from '../../../../server/kb-gaps';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kbGaps');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
}

const CHIP_ON =
  'px-3 py-1.5 rounded-full bg-primary-container text-on-primary font-title-sm text-title-sm';
const CHIP_OFF =
  'px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface font-body-md text-body-md';
const SECTION = 'bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md';
const H2 = 'font-title-md text-title-md text-on-surface';
const MUTED = 'font-body-sm text-body-sm text-on-surface-variant';

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

  const sp = await searchParams;
  const pendingTab = sp.tab === 'pending';
  let gaps: Awaited<ReturnType<ReturnType<typeof kbGaps>['list']>> | null = null;
  let drafts: Awaited<ReturnType<ReturnType<typeof distillDrafts>['list']>> = [];
  let draftCount = 0;
  let cards: Awaited<ReturnType<ReturnType<typeof kbGaps>['approvedCards']>> = [];
  try {
    const ctx = { workspaceId: workspace.id, userId: user.id };
    gaps = await kbGaps().list(ctx, filter);
    // Tab "Chờ duyệt" (M3): chỉ là gợi ý thêm — lỗi đọc không làm hỏng trang dữ liệu còn thiếu.
    drafts = pendingTab
      ? await distillDrafts()
          .list(ctx)
          .catch(() => [])
      : [];
    draftCount = await distillDrafts()
      .count(ctx)
      .catch(() => 0);
    cards = await kbGaps()
      .approvedCards(ctx)
      .catch(() => []); // huy hiệu chỉ là gợi ý: lỗi đọc thẻ không làm hỏng trang
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
    <main className="app-page app-page-wide">
      <KbFrame active="kbGaps">
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('title')} subtitle={t('subtitle')} />
          <nav
            aria-label={t('filterLabel')}
            className="flex flex-wrap items-center gap-2 bg-surface-container-low p-1.5 rounded-xl"
          >
            <Link
              href="/app/kb-gaps"
              aria-current={pendingTab ? undefined : 'page'}
              className={pendingTab ? CHIP_OFF : CHIP_ON}
            >
              {t('title')}
            </Link>
            <Link
              href="/app/kb-gaps?tab=pending"
              aria-current={pendingTab ? 'page' : undefined}
              className={pendingTab ? CHIP_ON : CHIP_OFF}
            >
              {t('drafts.tab')} ({draftCount})
            </Link>
          </nav>
          {pendingTab ? (
            <section className={SECTION}>
              <h2 className={H2}>{t('drafts.title')}</h2>
              <p className={MUTED}>{t('drafts.subtitle')}</p>
              {drafts.length === 0 ? (
                <p className={MUTED}>{t('drafts.empty')}</p>
              ) : (
                <ul className="space-y-space-md">
                  {drafts.map((draft) => (
                    <DraftFaqRow
                      key={draft.id}
                      draft={{
                        id: draft.id,
                        kind: draft.kind,
                        question: draft.question,
                        answer: draft.answer,
                        evidenceQuote: draft.evidenceQuote ?? '',
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : null}
          <nav
            aria-label={t('filterLabel')}
            className="flex flex-wrap items-center gap-2 bg-surface-container-low p-1.5 rounded-xl"
            hidden={pendingTab}
          >
            {KB_GAP_STATUSES.map((s) => (
              <Link
                key={s}
                href={href({ status: s })}
                aria-current={filter.status === s ? 'page' : undefined}
                className={filter.status === s ? CHIP_ON : CHIP_OFF}
              >
                {t(`status.${s}`)}
              </Link>
            ))}
            <span className={MUTED}>·</span>
            <Link
              href={href({ topic: '' })}
              aria-current={filter.topic ? undefined : 'page'}
              className={filter.topic ? CHIP_OFF : CHIP_ON}
            >
              {t('allTopics')}
            </Link>
            {KB_GAP_TOPICS.map((topic) => (
              <Link
                key={topic}
                href={href({ topic })}
                aria-current={filter.topic === topic ? 'page' : undefined}
                className={filter.topic === topic ? CHIP_ON : CHIP_OFF}
              >
                {t(`topic.${topic}`)}
              </Link>
            ))}
          </nav>
          {pendingTab ? null : groups.length === 0 ? (
            <p className={MUTED}>{t('empty')}</p>
          ) : (
            groups.map((group) => (
              <section key={group.topic} className={SECTION}>
                <h2 className={H2}>
                  {t('groupTitle', { topic: t(`topic.${group.topic}`), total: group.total })}
                </h2>
                <ul className="space-y-space-md">
                  {group.gaps.map((gap) => (
                    <KbGapRow
                      key={gap.id}
                      gap={gap}
                      newCard={
                        gap.status === 'open' && hasNewCard(gap.topic, gap.lastSeenAt, cards)
                      }
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </KbFrame>
    </main>
  );
}
