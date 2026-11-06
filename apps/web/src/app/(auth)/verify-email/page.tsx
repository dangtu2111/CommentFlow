import { CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getBrand } from '../../../server/brand';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('verify.successTitle')} · ${getBrand().name}` };
}

/** Đích sau khi bấm link trong thư xác minh (Better Auth chuyển về đây; lỗi kèm `?error=`). */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (!params.error && params.status !== 'ok') redirect('/login');
  const t = await getTranslations('auth.verify');
  const failed = Boolean(params.error);
  const Icon = failed ? CircleAlert : CircleCheck;
  return (
    <>
      <span className={`status-icon ${failed ? 'status-icon-danger' : 'status-icon-success'}`}>
        <Icon size={24} aria-hidden="true" />
      </span>
      <div className="stack">
        <h1 className="auth-title">{failed ? t('errorTitle') : t('successTitle')}</h1>
        <p className="auth-subtitle">{failed ? t('errorBody') : t('successBody')}</p>
      </div>
      <Link href={failed ? '/login' : '/login?verified=1'} className="btn btn-primary btn-block">
        {t('toLogin')}
      </Link>
    </>
  );
}
