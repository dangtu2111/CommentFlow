import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthTabs } from '../../../components/auth/auth-shell';
import { RegisterForm } from '../../../components/auth/forms';
import { getCurrentUser } from '../../../server/session';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('register.title')} · ${t('brand')}` };
}

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/app');
  const t = await getTranslations('auth');
  return (
    <>
      <AuthTabs active="register" />
      <div className="stack">
        <h1 className="auth-title">{t('register.title')}</h1>
        <p className="auth-subtitle">{t('register.subtitle')}</p>
      </div>
      <RegisterForm />
    </>
  );
}
