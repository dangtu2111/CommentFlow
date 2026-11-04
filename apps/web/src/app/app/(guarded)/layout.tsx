import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { WorkspaceSwitcher } from '../../../components/app/workspace-switcher';
import { getAuthRuntime } from '../../../server/auth';
import { requireAppUser } from '../../../server/require-app-user';

/**
 * Khung của nhóm `(guarded)`: cổng (phiên, email, 2FA Owner/Admin, workspace đang chọn) + đầu trang có bộ chuyển
 * workspace. Mỗi trang con VẪN tự gọi `requireAppUser` (layout không chạy lại khi chuyển trang cùng nhóm).
 */
export default async function GuardedAppLayout({ children }: { children: ReactNode }) {
  const { user, workspace } = await requireAppUser({});
  const [memberships, t] = await Promise.all([
    getAuthRuntime().tenancy.listWorkspacesOfUser(user.id),
    getTranslations('workspace.header'),
  ]);
  return (
    <>
      <header className="app-header">
        <Link href="/app" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <MessageSquareText size={18} />
          </span>
          {t('brand')}
        </Link>
        <WorkspaceSwitcher current={workspace} memberships={memberships} />
        <nav className="app-nav" aria-label={t('nav')}>
          <Link href="/app/comments">{t('comments')}</Link>
          {workspace.role === 'owner' ? <Link href="/app/members">{t('members')}</Link> : null}
          <Link href="/app/security">{t('security')}</Link>
        </nav>
      </header>
      {children}
    </>
  );
}
