import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { TryAiForm } from '../../../../components/try-ai/try-ai-form';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('tryAi'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

/**
 * Thử AI (FR-059, FR-029, US-034): chỉ Owner (Staff nhận 404). Chạy cả pipeline bằng mock, không trừ lượt gói
 * (BR-03). Không đọc/ghi dữ liệu workspace nào ở trang này.
 */
export default async function TryAiPage() {
  await requireAppUser({ role: 'owner' });
  const t = await getTranslations('tryAi');
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="tryAi">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
        <p className="muted">{t('mockNote')}</p>
        <TryAiForm />
      </KbFrame>
    </main>
  );
}
