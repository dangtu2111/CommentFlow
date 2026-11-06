import { DEFAULT_TIME_ZONE, WORKSPACE_TIME_ZONES } from '@flow/saas-core';
import { DEFAULT_LOCALE, isLocale } from '@flow/shared';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CreateWorkspaceForm } from '../../../../components/app/create-workspace-form';
import { OnboardingStepper } from '../../../../components/app/onboarding-stepper';
import { SimpleTopbar } from '../../../../components/app/simple-topbar';
import { getBrand } from '../../../../server/brand';
import { pendingInviteToken } from '../../../../server/invite-cookie';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('workspace.create');
  return { title: `${t('title')} · ${getBrand().name}` };
}

const NEXT_KEYS = ['channels', 'knowledge', 'invite'] as const;

/** Bước đầu của UF-1: người chưa có workspace tạo workspace của mình (người tạo là Owner). */
export default async function CreateWorkspacePage() {
  await requireAppUser({ workspace: 'optional' });
  // Có lời mời đang chờ (người mới đăng ký từ link mời): nhận lời mời trước, không bắt tạo workspace riêng.
  if (await pendingInviteToken()) redirect('/invite/resume');
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return (
    <div className="page-frame">
      <SimpleTopbar href="/app" />
      <main className="page-frame-main">
        <section className="card hero-card">
          <p className="hero-code">{t('onboarding.eyebrow')}</p>
          <h1 className="hero-title">{t('workspace.create.title')}</h1>
          <p className="hero-body">{t('workspace.create.subtitle')}</p>
        </section>
        <OnboardingStepper active="workspace" />
        <div className="two-col two-col-wide">
          <section className="card" aria-labelledby="create-ws-title">
            <h2 id="create-ws-title" className="visually-hidden">
              {t('workspace.create.title')}
            </h2>
            <CreateWorkspaceForm
              timeZones={WORKSPACE_TIME_ZONES}
              defaultTimeZone={DEFAULT_TIME_ZONE}
              defaultLang={isLocale(locale) ? locale : DEFAULT_LOCALE}
            />
          </section>
          <aside className="stack">
            <section className="card stack">
              <h2 className="section-subtitle">{t('onboarding.next.title')}</h2>
              <ul className="perm-list">
                {NEXT_KEYS.map((key) => (
                  <li key={key}>{t(`onboarding.next.list.${key}`)}</li>
                ))}
              </ul>
            </section>
            <section className="card stack">
              <h2 className="section-subtitle">{t('onboarding.promise.title')}</h2>
              <p className="muted">{t('onboarding.promise.body')}</p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
