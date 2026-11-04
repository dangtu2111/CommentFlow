import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { pendingInviteToken } from '../../../server/invite-cookie';
import { requireAppUser } from '../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: t('brand') };
}

/** Trang tạm sau đăng nhập: kết nối Fanpage và onboarding tiếp theo làm ở nhánh sau. */
export default async function AppHomePage() {
  const { user, workspace } = await requireAppUser({});
  // Người vừa đăng nhập/xác minh sau khi bấm link mời: quay lại trang chấp nhận lời mời.
  // Route /invite/resume dùng cookie MỘT lần (xóa ngay) rồi mới chuyển tới trang lời mời.
  if (await pendingInviteToken()) redirect('/invite/resume');
  const t = await getTranslations('auth');
  return (
    <main className="app-page">
      <h1 className="auth-title">{t('app.greeting', { name: user.name })}</h1>
      <p className="auth-subtitle">{t('app.body', { workspace: workspace.name })}</p>
    </main>
  );
}
