'use client';

import type { WorkspaceMembership } from '@flow/saas-core';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { switchWorkspaceAction } from '../../app/app/workspace/actions';
import { filterWorkspacesByName } from '../../lib/workspace-filter';

export type WorkspaceSwitcherLabels = {
  search: string;
  empty: string;
  create: string;
  leave: string;
  roles: Record<WorkspaceMembership['role'], string>;
};

/**
 * Danh sách workspace của bộ chuyển (FR-005) kèm ô tìm kiếm theo tên. Chỉ lọc phía trình duyệt trên danh sách đã nạp;
 * chọn workspace vẫn gửi id qua server action, server kiểm lại thành viên (id từ client không được tin).
 */
export type SwitcherWorkspace = WorkspaceMembership & {
  /** Nhãn số cần xử lý ("7", "99+"); `null` = không hiện (0 hoặc không đọc được). */
  pendingLabel: string | null;
  /** Mô tả đầy đủ cho trình đọc màn hình ("7 bình luận cần xử lý"). */
  pendingAria: string | null;
};

export function WorkspaceSwitcherList({
  currentId,
  memberships,
  labels,
}: {
  currentId: string;
  memberships: SwitcherWorkspace[];
  labels: WorkspaceSwitcherLabels;
}) {
  const [query, setQuery] = useState('');
  const visible = filterWorkspacesByName(memberships, query);
  return (
    <div className="ws-switch-list">
      <input
        type="search"
        className="ws-switch-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={labels.search}
        aria-label={labels.search}
        autoComplete="off"
      />
      <ul className="ws-switch-items">
        {visible.map((workspace) => (
          <li key={workspace.id}>
            <form action={switchWorkspaceAction}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <button
                type="submit"
                className="ws-switch-item"
                aria-current={workspace.id === currentId ? 'true' : undefined}
                disabled={workspace.id === currentId}
              >
                <span className="ws-switch-name">{workspace.name}</span>
                <span className="muted">{labels.roles[workspace.role]}</span>
                {workspace.pendingLabel ? (
                  <span
                    className="ws-switch-count"
                    role="img"
                    aria-label={workspace.pendingAria ?? undefined}
                  >
                    {workspace.pendingLabel}
                  </span>
                ) : null}
                {workspace.id === currentId ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            </form>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="muted ws-switch-empty" role="status">
            {labels.empty}
          </li>
        ) : null}
        <li>
          <a className="ws-switch-item" href="/app/onboarding/workspace">
            {labels.create}
          </a>
        </li>
        <li>
          <a className="ws-switch-item" href="/app/leave">
            {labels.leave}
          </a>
        </li>
      </ul>
    </div>
  );
}
