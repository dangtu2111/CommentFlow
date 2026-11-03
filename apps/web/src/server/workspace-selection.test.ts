import type { WorkspaceMembership } from '@flow/saas-core';
import { describe, expect, it } from 'vitest';
import { chooseWorkspace } from './workspace-selection';

const m = (id: string, role: 'owner' | 'staff' = 'staff'): WorkspaceMembership => ({
  id,
  name: id,
  slug: id,
  role,
});

describe('chooseWorkspace', () => {
  const list = [m('a', 'owner'), m('b')];
  it('dùng workspace trong cookie khi còn là thành viên', () => {
    expect(chooseWorkspace(list, 'b')?.id).toBe('b');
  });
  it('id không thuộc mình (cookie giả, đã bị gỡ) → rơi về workspace đầu tiên, không bao giờ trả id lạ', () => {
    expect(chooseWorkspace(list, 'zzz')?.id).toBe('a');
  });
  it('không có cookie → workspace đầu tiên', () => {
    expect(chooseWorkspace(list, null)?.id).toBe('a');
  });
  it('không còn workspace nào → null', () => {
    expect(chooseWorkspace([], 'a')).toBeNull();
  });
});
