import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthHeading } from '../../../components/auth/auth-shell';
import { AuthStatus } from '../../../components/auth/auth-status';
import { authButtonClass } from '../../../components/auth/auth-styles';
import { ResetPasswordForm } from '../../../components/auth/forms';
import { getBrand } from '../../../server/brand';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('reset.title')} · ${getBrand().name}` };
}

/** Đích sau khi bấm link trong thư đặt lại mật khẩu (`?token=...`; token sai/hết hạn → `?error=`). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const [t, params] = await Promise.all([getTranslations('auth.reset'), searchParams]);
  if (params.error || !params.token) {
    return (
      <>
        <AuthStatus
          icon={CircleAlert}
          tone="danger"
          title={t('invalidTitle')}
          description={t('invalidBody')}
        />
        <Link href="/forgot-password" className={authButtonClass()}>
          {t('requestNew')}
        </Link>
      </>
    );
  }
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <ResetPasswordForm token={params.token} />
    </>
  );
}
