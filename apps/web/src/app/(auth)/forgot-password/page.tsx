import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthHeading } from '../../../components/auth/auth-shell';
import { ForgotPasswordForm } from '../../../components/auth/forms';
import { getBrand } from '../../../server/brand';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('forgot.title')} · ${getBrand().name}` };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot');
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <ForgotPasswordForm />
      <p className="text-center font-label-md text-label-md text-primary [&_a]:hover:underline">
        <Link href="/login">{t('back')}</Link>
      </p>
    </>
  );
}
