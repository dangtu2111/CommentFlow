import { getTranslations } from 'next-intl/server';
import { KbPageHead } from '../../../../components/kb/kb-content-ui';
import { KbFrame } from '../../../../components/kb/kb-frame';
import { KbTestSetForm } from '../../../../components/kb-testset/kb-testset-form';
import { getBrand } from '../../../../server/brand';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('kbTestset');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
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
        <div className="tw space-y-space-lg">
          <KbPageHead title={t('title')} subtitle={t('subtitle')} />
          <p className="font-body-sm text-body-sm text-on-surface-variant">{t('mockNote')}</p>
          <KbTestSetForm />
        </div>
      </KbFrame>
    </main>
  );
}
