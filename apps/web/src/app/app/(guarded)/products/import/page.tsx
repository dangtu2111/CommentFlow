import { getTranslations } from 'next-intl/server';
import { KbFrame } from '../../../../../components/kb/kb-frame';
import { ImportWizard } from '../../../../../components/products/import-wizard';
import { getBrand } from '../../../../../server/brand';
import { requireAppUser } from '../../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('productImport');
  return { title: `${t('pageTitle')} · ${getBrand().name}` };
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
