import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SessionsCard } from '../../../components/security/sessions-card';
import { TwoFactorCard } from '../../../components/security/two-factor-card';
import { Banner } from '../../../components/ui/banner';
import { getAuthRuntime } from '../../../server/auth';
import { requestContext } from '../../../server/request-context';
import { requireAppUser } from '../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('security.pageTitle')} · ${t('brand')}` };
}

/**
 * Trang bắt buộc bật 2FA (ngoài khung): 2FA + các phiên đăng nhập CỦA CHÍNH người dùng. Giao diện đầy đủ ở `/app/settings`.
 * Nằm NGOÀI nhóm `(guarded)` nên Owner/Admin chưa bật 2FA vẫn vào được để bật.
 */
export default async function SecurityPage() {
  await requireAppUser({ workspace: 'optional', twoFactor: 'skip' });
  const overview = await getAuthRuntime().twoFactor.overview((await requestContext()).headers);
  if (!overview) redirect('/login');
  const t = await getTranslations('auth.security');
  const mustEnable = overview.required && !overview.twoFactorEnabled;
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle')}</p>
      {mustEnable ? <Banner variant="warning">{t('requiredBanner')}</Banner> : null}
      {/* Giữ nguyên vị trí TwoFactorCard trong cây: đổi vị trí/key làm nó mount lại và mất state `enrolling` (mã dự phòng biến mất). */}
      <TwoFactorCard enabled={overview.twoFactorEnabled} required={overview.required} />
      <SessionsCard sessions={overview.sessions} />
      <p>
        <Link href="/app">{t('backToApp')}</Link>
      </p>
    </main>
  );
}
