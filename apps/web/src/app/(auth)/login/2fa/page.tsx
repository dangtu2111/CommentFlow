import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuthHeading } from '../../../../components/auth/auth-shell';
import { TwoFactorForm } from '../../../../components/auth/two-factor-form';
import { getAuthRuntime } from '../../../../server/auth';
import { getBrand } from '../../../../server/brand';
import { getCurrentUser } from '../../../../server/session';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('twoFactor.title')} · ${getBrand().name}` };
}

/** Bước nhập mã 2FA. Không có cookie chờ hợp lệ (chưa qua bước mật khẩu, hoặc hết hạn) → về /login. */
export default async function TwoFactorPage() {
  if (await getCurrentUser()) redirect('/app');
  if (!getAuthRuntime().twoFactor.hasPending(await headers())) redirect('/login');
  const t = await getTranslations('auth.twoFactor');
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <TwoFactorForm />
    </>
  );
}
