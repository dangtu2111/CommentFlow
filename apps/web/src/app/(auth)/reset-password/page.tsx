import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from '../../../components/auth/forms';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('reset.title')} · ${t('brand')}` };
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
        <span className="status-icon status-icon-danger">
          <CircleAlert size={24} aria-hidden="true" />
        </span>
        <div className="stack">
          <h1 className="auth-title">{t('invalidTitle')}</h1>
          <p className="auth-subtitle">{t('invalidBody')}</p>
        </div>
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
