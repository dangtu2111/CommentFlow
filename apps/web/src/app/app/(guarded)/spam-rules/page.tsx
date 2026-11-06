import { getTranslations } from 'next-intl/server';
import { SpamRuleBuilder } from '../../../../components/spam-rules/spam-rule-builder';
import { Banner } from '../../../../components/ui/banner';
import { PageHeader } from '../../../../components/ui/page-header';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('spamRules'), getTranslations('shell')]);
  return { title: `${t('title')} · ${tb('brand')}` };
}

/** Quy tắc spam (FR-080, US-050, UF-4): chỉ Owner (Staff nhận 404). Tạo quy tắc + xem trước số bình luận khớp 7 ngày. */
export default async function SpamRulesPage() {
  await requireAppUser({ role: 'owner' });
  const t = await getTranslations('spamRules');
  return (
    <main className="app-page app-page-wide spam-page">
      <header className="spam-header">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
      </header>
      <Banner variant="info">
        <strong>{t('principle.title')}</strong>
        <p className="spam-principle-body">{t('principle.body')}</p>
      </Banner>
      <SpamRuleBuilder />
    </main>
  );
}
