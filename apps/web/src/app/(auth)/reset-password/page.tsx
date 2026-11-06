import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthStatus } from '../../../components/auth/auth-status';
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
        <Link href="/forgot-password" className="btn btn-primary btn-block">
          {t('requestNew')}
        </Link>
      </>
    );
  }
  return (
    <>
      <div className="stack">
        <h1 className="auth-title">{t('title')}</h1>
        <p className="auth-subtitle">{t('subtitle')}</p>
      </div>
      <ResetPasswordForm token={params.token} />
    </>
  );
}
