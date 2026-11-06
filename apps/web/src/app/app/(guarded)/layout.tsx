import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { NotificationBell } from '../../../components/app/notification-bell';
import { ShellNav } from '../../../components/app/shell-nav';
import { SystemBanners } from '../../../components/app/system-banners';
import { UserCard } from '../../../components/app/user-card';
import { WorkspaceSwitcher } from '../../../components/app/workspace-switcher';
import { BrandLogo } from '../../../components/brand-logo';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { SubmitButton } from '../../../components/ui/submit-button';
import { navGroupsFor } from '../../../lib/app-nav';
import { buildNotifications } from '../../../lib/notification-model';
import { getAuthRuntime } from '../../../server/auth';
import { requireAppUser } from '../../../server/require-app-user';
import { loadShellAlerts } from '../../../server/shell-alerts';
import { loadActionableCounts } from '../../../server/workspace-counts';
import { logoutAction } from '../../(auth)/actions';

/**
 * Khung ứng dụng (docs/08 §3) của nhóm `(guarded)`: cổng (phiên, email, 2FA Owner/Admin, workspace đang chọn) + thanh
 * trên (thương hiệu, bộ chuyển workspace, ngôn ngữ, người dùng) + thanh điều hướng (chỉ trang đã tồn tại, lọc theo vai
 * trò) + khe banner hệ thống. Mỗi trang con VẪN tự gọi `requireAppUser` (layout không chạy lại khi chuyển trang cùng nhóm).
 */
export default async function GuardedAppLayout({ children }: { children: ReactNode }) {
  const { user, workspace } = await requireAppUser({});
  const [memberships, t, tRole] = await Promise.all([
    getAuthRuntime().tenancy.listWorkspacesOfUser(user.id),
    getTranslations('shell'),
    getTranslations('workspace.switcher'),
  ]);
  const [counts, alerts] = await Promise.all([
    loadActionableCounts(user.id, memberships),
    loadShellAlerts(workspace.id, user.id, workspace.role),
  ]);
  const roleLabel = tRole(`role.${workspace.role}`);
  const groups = navGroupsFor(workspace.role).map((group) => ({
    key: group.key,
    label: t(`groups.${group.key}`),
    items: group.items.map((item) => ({ ...item, label: t(`nav.${item.key}`) })),
  }));
  return (
    <div className="shell">
      <header className="shell-top">
        <BrandLogo href="/app" />
        <WorkspaceSwitcher current={workspace} memberships={memberships} counts={counts} />
        <div className="shell-top-end">
          <LocaleSwitcher />
          <NotificationBell
            model={buildNotifications(alerts.banners, alerts.silent)}
            canOpenChannels={workspace.role === 'owner'}
          />
          <form action={logoutAction}>
            <SubmitButton variant="secondary" block={false}>
              {t('logout')}
            </SubmitButton>
          </form>
        </div>
      </header>
      <div className="shell-body">
        <ShellNav
          groups={groups}
          label={t('navLabel')}
          footer={<UserCard name={user.name} roleLabel={roleLabel} />}
        />
        <div className="shell-main">
          {/* Khe banner hệ thống (docs/08 §3): hiện tại kênh mất kết nối (FR-012); hạn mức AI/dùng thử làm sau. */}
          <div data-slot="banners">
            <SystemBanners alerts={alerts} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
