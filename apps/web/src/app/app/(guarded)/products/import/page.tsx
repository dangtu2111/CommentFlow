import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { ImportWizard } from '../../../../../components/products/import-wizard';
import { requireAppUser } from '../../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('productImport'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

/** Nhập sản phẩm Excel/CSV (FR-051, US-003): chỉ Owner; Staff nhận 404. */
export default async function ProductImportPage() {
  await requireAppUser({ role: 'owner' });
  const t = await getTranslations('productImport');
  return (
    <main className="app-page app-page-wide">
      <KbFrame active="productImport">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
        <ImportWizard />
      </KbFrame>
    </main>
  );
}
