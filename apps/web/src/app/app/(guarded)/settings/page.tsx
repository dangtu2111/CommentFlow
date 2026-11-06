import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SessionsCard } from '../../../../components/security/sessions-card';
import { TwoFactorCard } from '../../../../components/security/two-factor-card';
import { LanguageCard } from '../../../../components/settings/language-card';
import { getAuthRuntime } from '../../../../server/auth';
import { requestContext } from '../../../../server/request-context';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('settings'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

/**
 * Cài đặt (FR-001, FR-119; Stitch `settings-security`): 2FA + phiên đăng nhập CỦA CHÍNH người dùng + ngôn ngữ.
 * Mọi vai trò vào được (không có dữ liệu workspace nào ở đây). Nằm trong `(guarded)` nên có khung ứng dụng; Owner/Admin
 * chưa bật 2FA bị cổng chuyển sang `/app/security` (trang ngoài khung) để bật trước.
 */
export default async function SettingsPage() {
  await requireAppUser({});
  const overview = await getAuthRuntime().twoFactor.overview((await requestContext()).headers);
  if (!overview) redirect('/login');
  const t = await getTranslations('settings');
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle')}</p>
      <TwoFactorCard enabled={overview.twoFactorEnabled} required={overview.required} />
      <SessionsCard sessions={overview.sessions} />
      <LanguageCard />
    </main>
  );
}
