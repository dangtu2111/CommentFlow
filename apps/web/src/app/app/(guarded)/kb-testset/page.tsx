import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbTestSetForm } from '../../../../components/kb-testset/kb-testset-form';
import { PageHeader } from '../../../../components/ui/page-header';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('kbTestset'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

/**
 * Câu kiểm thử kiến thức (FR-054, US-034): chỉ Owner (Staff nhận 404). Chạy bộ câu qua pipeline Thử AI bằng mock,
 * không trừ lượt gói (BR-03). Không đọc/ghi dữ liệu workspace ở trang này.
 */
export default async function KbTestSetPage() {
  await requireAppUser({ role: 'owner' });
  const t = await getTranslations('kbTestset');
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="kbTestset">
        <header className="kb-head">
          <PageHeader title={t('title')} subtitle={t('subtitle')} />
        </header>
        <p className="muted">{t('mockNote')}</p>
        <KbTestSetForm />
      </KbFrame>
    </main>
  );
}
