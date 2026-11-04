import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ShellNav } from '../../../components/app/shell-nav';
import { SystemBanners } from '../../../components/app/system-banners';
import { WorkspaceSwitcher } from '../../../components/app/workspace-switcher';
import { LocaleSwitcher } from '../../../components/locale-switcher';
import { SubmitButton } from '../../../components/ui/submit-button';
import { navGroupsFor } from '../../../lib/app-nav';
import { getAuthRuntime } from '../../../server/auth';
import { requireAppUser } from '../../../server/require-app-user';
import { logoutAction } from '../../(auth)/actions';

/**
 * Khung ứng dụng (docs/08 §3) của nhóm `(guarded)`: cổng (phiên, email, 2FA Owner/Admin, workspace đang chọn) + thanh
 * trên (thương hiệu, bộ chuyển workspace, ngôn ngữ, người dùng) + thanh điều hướng (chỉ trang đã tồn tại, lọc theo vai
 * trò) + khe banner hệ thống. Mỗi trang con VẪN tự gọi `requireAppUser` (layout không chạy lại khi chuyển trang cùng nhóm).
 */
export default async function GuardedAppLayout({ children }: { children: ReactNode }) {
  const { user, workspace } = await requireAppUser({});
  const [memberships, t] = await Promise.all([
    getAuthRuntime().tenancy.listWorkspacesOfUser(user.id),
    getTranslations('shell'),
  ]);
  const groups = navGroupsFor(workspace.role).map((group) => ({
    key: group.key,
    label: t(`groups.${group.key}`),
    items: group.items.map((item) => ({ ...item, label: t(`nav.${item.key}`) })),
  }));
  return (
    <div className="shell">
      <header className="shell-top">
        <Link href="/app" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <MessageSquareText size={18} />
          </span>
          {t('brand')}
        </Link>
        <WorkspaceSwitcher current={workspace} memberships={memberships} />
        <div className="shell-top-end">
          <LocaleSwitcher />
          <span className="shell-user" title={user.name}>
            {user.name}
          </span>
          <form action={logoutAction}>
            <SubmitButton variant="secondary" block={false}>
              {t('logout')}
            </SubmitButton>
          </form>
        </div>
      </header>
      <div className="shell-body">
        <ShellNav groups={groups} label={t('navLabel')} />
        <div className="shell-main">
          {/* Khe banner hệ thống (docs/08 §3): hiện tại kênh mất kết nối (FR-012); hạn mức AI/dùng thử làm sau. */}
          <div data-slot="banners">
            <SystemBanners workspaceId={workspace.id} userId={user.id} role={workspace.role} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
