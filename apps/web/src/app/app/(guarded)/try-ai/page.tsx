import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { TryAiForm } from '../../../../components/try-ai/try-ai-form';
import { initialTryAiText } from '../../../../lib/try-ai-prefill';
import { getBrand } from '../../../../server/brand';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('tryAi');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
}

/**
 * Thử AI (FR-059, FR-029, US-034): chỉ Owner (Staff nhận 404). Chạy cả pipeline bằng mock, không trừ lượt gói
 * (BR-03). Không đọc/ghi dữ liệu workspace nào ở trang này.
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TryAiPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAppUser({ role: 'owner' });
  const [t, query] = await Promise.all([getTranslations('tryAi'), searchParams]);
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="tryAi">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
        <p className="muted">{t('mockNote')}</p>
        <TryAiForm initialText={initialTryAiText(query.q)} />
      </KbFrame>
    </main>
  );
}
