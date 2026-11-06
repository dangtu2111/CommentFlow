import { MailCheck } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthStatus } from '../../../components/auth/auth-status';
import { ResendVerificationForm } from '../../../components/auth/forms';
import { maskEmail } from '../../../lib/auth-form';
import { PENDING_EMAIL_COOKIE } from '../../../lib/pending-email';
import { getBrand } from '../../../server/brand';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('checkEmail.title')} · ${getBrand().name}` };
}

export default async function CheckEmailPage() {
  const t = await getTranslations('auth.checkEmail');
  const email = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  return (
    <>
      <AuthStatus
        icon={MailCheck}
        title={t('title')}
        description={email ? t('body', { email: maskEmail(email) }) : t('bodyNoEmail')}
      >
        <p className="font-body-md text-body-md text-on-surface-variant">{t('hint')}</p>
      </AuthStatus>
      {email ? <ResendVerificationForm email={email} /> : null}
      <p className="text-center font-label-md text-label-md text-primary [&_a]:hover:underline">
        <Link href="/login">{t('back')}</Link>
      </p>
    </>
  );
}
