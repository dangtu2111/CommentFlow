import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { TwoFactorCard } from '../../../components/security/two-factor-card';
import { Banner } from '../../../components/ui/banner';
import { SubmitButton } from '../../../components/ui/submit-button';
import { getAuthRuntime } from '../../../server/auth';
import { requestContext } from '../../../server/request-context';
import { requireAppUser } from '../../../server/require-app-user';
import { revokeSessionAction } from './actions';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('security.pageTitle')} · ${t('brand')}` };
}

/**
 * Trang bảo mật tạm (giao diện đầy đủ của Cài đặt làm ở nhánh sau): 2FA + các phiên đăng nhập CỦA CHÍNH người dùng.
 * Nằm NGOÀI nhóm `(guarded)` nên Owner/Admin chưa bật 2FA vẫn vào được để bật.
 */
export default async function SecurityPage() {
  await requireAppUser({ workspace: 'optional', twoFactor: 'skip' });
  const overview = await getAuthRuntime().twoFactor.overview((await requestContext()).headers);
  if (!overview) redirect('/login');
  const [t, format] = await Promise.all([getTranslations('auth.security'), getFormatter()]);
  const mustEnable = overview.required && !overview.twoFactorEnabled;
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('title')}</h1>
      <p className="auth-subtitle">{t('subtitle')}</p>
      {mustEnable ? <Banner variant="warning">{t('requiredBanner')}</Banner> : null}
      {/* Giữ nguyên vị trí TwoFactorCard trong cây: đổi vị trí/key làm nó mount lại và mất state `enrolling` (mã dự phòng biến mất). */}
      <TwoFactorCard enabled={overview.twoFactorEnabled} required={overview.required} />
      <section className="card stack" aria-labelledby="language-title">
        <h2 id="language-title" className="section-title">
          {t('language.title')}
        </h2>
        <p className="muted">{t('language.body')}</p>
        <LocaleSwitcher />
      </section>
      <section className="card stack" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="section-title">
          {t('sessions.title')}
        </h2>
        <p className="muted">{t('sessions.body')}</p>
        {overview.sessions.length === 0 ? <p className="muted">{t('sessions.empty')}</p> : null}
        <ul className="session-list">
          {overview.sessions.map((session) => (
            <li key={session.id} className="session-item">
              <div>
                <p className="session-device">
                  {t('sessions.device', {
                    browser: t(`sessions.browser.${session.browser}`),
                    os: t(`sessions.os.${session.os}`),
                  })}
                  {session.current ? (
                    <span className="badge badge-on">{t('sessions.current')}</span>
                  ) : null}
                </p>
                <p className="muted">
                  {t('sessions.lastUsed', {
                    date: format.dateTime(session.lastUsedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              </div>
              {session.current ? null : (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <SubmitButton variant="secondary" block={false}>
                    {t('sessions.signOut')}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p>
        <Link href="/app">{t('backToApp')}</Link>
      </p>
    </main>
  );
}
