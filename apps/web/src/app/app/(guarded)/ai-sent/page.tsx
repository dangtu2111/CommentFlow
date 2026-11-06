import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AiSentRow } from '../../../../components/ai-sent/ai-sent-row';
import {
  AI_SENT_PAGE_SIZE,
  AI_SENT_STATUS_FILTERS,
  parseAiSentFilter,
} from '../../../../lib/ai-sent-form';
import { aiSentHistory } from '../../../../server/ai-sent-history';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('aiSent'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * AI đã gửi (FR-075): Owner và Staff xem được. Hiện đọc store bộ nhớ rỗng (Q-ASH1, chờ bảng `drafts`/
 * `automation_events`), nên thường hiện trạng thái trống; nút Đánh dấu sai đã chạy trên store đó.
 */
export default async function AiSentPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({});
  const [t, query] = await Promise.all([
    getTranslations('aiSent'),
    searchParams.then(parseAiSentFilter),
  ]);

  let result: Awaited<ReturnType<ReturnType<typeof aiSentHistory>['list']>> | null = null;
  try {
    result = await aiSentHistory().list(
      { workspaceId: workspace.id, userId: user.id, role: workspace.role },
      query,
    );
  } catch {
    result = null; // không lộ chi tiết lỗi ra giao diện
  }
  if (!result) {
    return (
      <main className="app-page" role="alert">
        <h1 className="auth-title">{t('loadError.title')}</h1>
        <p className="muted">{t('loadError.body')}</p>
      </main>
    );
  }

  const page = Math.floor(query.offset / AI_SENT_PAGE_SIZE) + 1;
  const hasNext = query.offset + AI_SENT_PAGE_SIZE < result.page.total;
  const href = (patch: { status?: string; page?: number }) =>
    `/app/ai-sent?status=${patch.status ?? query.status}&page=${patch.page ?? 1}`;

  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle')}</p>
      {result.signal.pause ? (
        <p role="alert" className="banner banner-warning">
          {t('signal', { wrong: result.signal.wrong, sent: result.signal.sent })}
        </p>
      ) : null}
      <nav aria-label={t('filterLabel')} className="row">
        {AI_SENT_STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={href({ status: s })}
            aria-current={query.status === s ? 'page' : undefined}
          >
            {t(`filter.${s}`)}
          </Link>
        ))}
      </nav>
      {result.page.items.length === 0 ? (
        <p className="muted">{t('empty')}</p>
      ) : (
        <ul className="stack">
          {result.page.items.map((item) => (
            <AiSentRow
              key={item.id}
              item={{
                id: item.id,
                text: item.text,
                label: item.label,
                confidence: item.confidence,
                sentAt: item.sentAt.toISOString(),
                status: item.status,
                wrongReason: item.wrongReason,
              }}
            />
          ))}
        </ul>
      )}
      <nav aria-label={t('pagination')} className="row">
        {page > 1 ? <Link href={href({ page: page - 1 })}>{t('prev')}</Link> : null}
        {hasNext ? <Link href={href({ page: page + 1 })}>{t('next')}</Link> : null}
      </nav>
    </main>
  );
}
