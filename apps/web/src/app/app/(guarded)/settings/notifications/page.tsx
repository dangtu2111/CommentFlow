import { getTranslations } from 'next-intl/server';
import { NotificationsView } from '../../../../../components/settings/notifications-view';
import { requireAppUser } from '../../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../../server/settings-counts';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('settings'), getTranslations('shell')]);
  return { title: `${t('notifications.title')} · ${tb('brand')}` };
}

/** Thông báo: mọi vai trò (chỉ giao diện "Sắp có", không dữ liệu workspace). */
export default async function NotificationsPage() {
  const { user, workspace } = await requireAppUser({});
  const counts = await loadSettingsCounts({
    role: workspace.role,
    workspaceId: workspace.id,
    userId: user.id,
  });
  return (
    <main className="app-page app-page-settings">
      <NotificationsView frame={{ viewerRole: workspace.role, counts }} />
    </main>
  );
}
