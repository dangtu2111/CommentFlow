import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '../../../components/auth/forms';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('forgot.title')} · ${t('brand')}` };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot');
  return (
    <>
      <div className="stack">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center">
        <Link href="/login">{t('back')}</Link>
      </p>
    </>
  );
}
