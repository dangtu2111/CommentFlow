import type { WorkspaceMembership } from '@flow/saas-core';
import { Check, ChevronsUpDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { switchWorkspaceAction } from '../../app/app/workspace/actions';

/**
 * Bộ chuyển workspace (FR-005, bản tối giản): liệt kê workspace mình là thành viên đang hoạt động. Mỗi mục là một
 * form gửi id; server kiểm lại thành viên trước khi đổi (id từ client không được tin).
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
      <ul className="ws-switch-list">
        {memberships.map((workspace) => (
          <li key={workspace.id}>
            <form action={switchWorkspaceAction}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <button
                type="submit"
                className="ws-switch-item"
                aria-current={workspace.id === current.id ? 'true' : undefined}
                disabled={workspace.id === current.id}
              >
                <span className="ws-switch-name">{workspace.name}</span>
                <span className="muted">{t(`role.${workspace.role}`)}</span>
                {workspace.id === current.id ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            </form>
          </li>
        ))}
        <li>
          <a className="ws-switch-item" href="/app/onboarding/workspace">
            {t('create')}
          </a>
        </li>
      </ul>
    </details>
  );
}
