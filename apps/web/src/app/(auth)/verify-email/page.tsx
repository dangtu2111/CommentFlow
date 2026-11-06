import { CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthStatus } from '../../../components/auth/auth-status';
import { authButtonClass } from '../../../components/auth/auth-styles';
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
  return (
    <>
      <AuthStatus
        icon={failed ? CircleAlert : CircleCheck}
        tone={failed ? 'danger' : 'success'}
        title={failed ? t('errorTitle') : t('successTitle')}
        description={failed ? t('errorBody') : t('successBody')}
      />
      <Link href={failed ? '/login' : '/login?verified=1'} className={authButtonClass()}>
        {t('toLogin')}
      </Link>
    </>
  );
}
