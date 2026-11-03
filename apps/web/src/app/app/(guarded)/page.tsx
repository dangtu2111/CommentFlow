import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { SubmitButton } from '../../../components/ui/submit-button';
import { getCurrentUser } from '../../../server/session';
import { logoutAction } from '../../(auth)/actions';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: t('brand') };
}

/** Trang tạm sau đăng nhập: workspace, kết nối Fanpage và onboarding làm ở nhánh sau. */
export default async function AppHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const t = await getTranslations('auth');
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('app.greeting', { name: user.name })}</h1>
      <p className="auth-subtitle">{t('app.body')}</p>
      <form action={logoutAction}>
        <SubmitButton variant="secondary" block={false}>
          {t('app.logout')}
        </SubmitButton>
      </form>
      <LocaleSwitcher />
    </main>
  );
}
