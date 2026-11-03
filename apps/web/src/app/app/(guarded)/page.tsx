import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { SubmitButton } from '../../../components/ui/submit-button';
import { requireAppUser } from '../../../server/require-app-user';
import { logoutAction } from '../../(auth)/actions';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: t('brand') };
}

/** Trang tạm sau đăng nhập: kết nối Fanpage và onboarding tiếp theo làm ở nhánh sau. */
export default async function AppHomePage() {
  const { user, workspace } = await requireAppUser({});
  const t = await getTranslations('auth');
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('app.greeting', { name: user.name })}</h1>
      <p className="auth-subtitle">{t('app.body', { workspace: workspace.name })}</p>
      <form action={logoutAction}>
        <SubmitButton variant="secondary" block={false}>
          {t('app.logout')}
        </SubmitButton>
      </form>
      <LocaleSwitcher />
    </main>
  );
}
