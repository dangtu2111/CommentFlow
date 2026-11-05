import type { WorkspaceMembership } from '@flow/saas-core';
import { ChevronsUpDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { type ActionableCounts, formatActionableCount } from '../../lib/workspace-count';
import { WorkspaceSwitcherList } from './workspace-switcher-list';

/**
 * Bộ chuyển workspace (FR-005): nút hiện workspace đang chọn; danh sách + ô tìm kiếm ở `WorkspaceSwitcherList` (client).
 * Mỗi workspace kèm số bình luận cần xử lý (FR-005-COUNT; định nghĩa ở `countActionableComments`).
 */
export async function WorkspaceSwitcher({
  current,
  memberships,
  counts,
}: {
  current: WorkspaceMembership;
  memberships: WorkspaceMembership[];
  /** Số bình luận cần xử lý theo id workspace (FR-005); `null`/thiếu = không hiện nhãn. */
  counts: ActionableCounts;
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
        memberships={memberships.map((membership) => {
          const count = counts[membership.id];
          return {
            ...membership,
            pendingLabel: formatActionableCount(count),
            pendingAria: count && count > 0 ? t('pending', { count }) : null,
          };
        })}
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
