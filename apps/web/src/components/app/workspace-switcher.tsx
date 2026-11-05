import type { WorkspaceMembership } from '@flow/saas-core';
import { ChevronsUpDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { WorkspaceSwitcherList } from './workspace-switcher-list';

/**
 * Bộ chuyển workspace (FR-005): nút hiện workspace đang chọn; danh sách + ô tìm kiếm ở `WorkspaceSwitcherList` (client).
 * Chưa có "số cần xử lý" (gap `FR-005-COUNT`).
 */
export async function WorkspaceSwitcher({
  current,
  memberships,
}: {
  current: WorkspaceMembership;
  memberships: WorkspaceMembership[];
}) {
  const t = await getTranslations('workspace.switcher');
  return (
    <details className="ws-switch">
      <summary className="ws-switch-button" aria-label={t('label')}>
        <span className="ws-switch-name">{current.name}</span>
        <span className="badge badge-off">{t(`role.${current.role}`)}</span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </summary>
      <WorkspaceSwitcherList
        currentId={current.id}
        memberships={memberships}
        labels={{
          search: t('search'),
          empty: t('empty'),
          create: t('create'),
          leave: t('leave'),
          roles: { owner: t('role.owner'), staff: t('role.staff') },
        }}
      />
    </details>
  );
}
