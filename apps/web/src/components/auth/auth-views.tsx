import { getTranslations } from 'next-intl/server';
import { AuthNotice } from './auth-fields';
import { AuthHeading, AuthTabs } from './auth-shell';
import { SocialLogin } from './auth-social';
import { LoginForm, RegisterForm } from './forms';

/** Nội dung thẻ "Đăng nhập" — dùng chung cho `/login` và route mẫu `/dev/ui/auth`. */
export async function LoginView({
  params = {},
}: {
  params?: { verified?: string; reset?: string; loggedOut?: string };
}) {
  const t = await getTranslations('auth');
  return (
    <>
      <AuthTabs active="login" />
      <AuthHeading title={t('login.title')} subtitle={t('login.subtitle')} />
      {params.verified ? <AuthNotice tone="success">{t('banners.verified')}</AuthNotice> : null}
      {params.reset ? <AuthNotice tone="success">{t('banners.resetDone')}</AuthNotice> : null}
      {params.loggedOut ? <AuthNotice>{t('banners.loggedOut')}</AuthNotice> : null}
      <SocialLogin />
      <LoginForm />
    </>
  );
}

/** Nội dung thẻ "Đăng ký" — dùng chung cho `/register` và route mẫu. */
export async function RegisterView({ sample }: { sample: boolean }) {
  const t = await getTranslations('auth');
  return (
    <>
      <AuthTabs active="register" />
      <AuthHeading title={t('register.title')} subtitle={t('register.subtitle')} />
      <SocialLogin />
      <RegisterForm sample={sample} />
    </>
  );
}
