import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthTabs } from '../../../components/auth/auth-shell';
import { LoginForm } from '../../../components/auth/forms';
import { Banner } from '../../../components/ui/banner';
import { getCurrentUser } from '../../../server/session';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('login.title')} · ${t('brand')}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; reset?: string; loggedOut?: string }>;
}) {
  if (await getCurrentUser()) redirect('/app');
  const [t, params] = await Promise.all([getTranslations('auth'), searchParams]);
  return (
    <>
      <AuthTabs active="login" />
      <div className="stack">
        <h1 className="auth-title">{t('login.title')}</h1>
        <p className="auth-subtitle">{t('login.subtitle')}</p>
      </div>
      {params.verified ? <Banner variant="success">{t('banners.verified')}</Banner> : null}
      {params.reset ? <Banner variant="success">{t('banners.resetDone')}</Banner> : null}
      {params.loggedOut ? <Banner variant="info">{t('banners.loggedOut')}</Banner> : null}
      <LoginForm />
    </>
  );
}
