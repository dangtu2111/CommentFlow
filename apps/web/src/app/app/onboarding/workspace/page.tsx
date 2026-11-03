import { DEFAULT_TIME_ZONE, WORKSPACE_TIME_ZONES } from '@flow/saas-core';
import { DEFAULT_LOCALE, isLocale } from '@flow/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { CreateWorkspaceForm } from '../../../../components/app/create-workspace-form';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('workspace.create');
  return { title: `${t('title')} · ${(await getTranslations('auth'))('brand')}` };
}

/** Bước đầu của UF-1: người chưa có workspace tạo workspace của mình (người tạo là Owner). */
export default async function CreateWorkspacePage() {
  await requireAppUser({ workspace: 'optional' });
  const [t, locale] = await Promise.all([getTranslations('workspace.create'), getLocale()]);
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle')}</p>
      <section className="card">
        <CreateWorkspaceForm
          timeZones={WORKSPACE_TIME_ZONES}
          defaultTimeZone={DEFAULT_TIME_ZONE}
          defaultLang={isLocale(locale) ? locale : DEFAULT_LOCALE}
        />
      </section>
    </main>
  );
}
