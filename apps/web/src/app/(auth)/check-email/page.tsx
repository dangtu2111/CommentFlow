import { MailCheck } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
      <span className="status-icon">
        <MailCheck size={24} aria-hidden="true" />
      </span>
      <div className="stack">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">
          {email ? t('body', { email: maskEmail(email) }) : t('bodyNoEmail')}
        </p>
        <p className="auth-subtitle">{t('hint')}</p>
      </div>
      {email ? <ResendVerificationForm email={email} /> : null}
      <p className="text-center">
        <Link href="/login">{t('back')}</Link>
      </p>
    </>
  );
}
