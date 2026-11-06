import type { Database } from '@flow/db/runtime';
import { describe, expect, it, vi } from 'vitest';
import { writeActionLog } from './action-log';

function fakeTx() {
  const values = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as Database, values };
}

const base = {
  workspaceId: 'w',
  actorId: 'u',
  action: 'member.role_changed',
  targetType: 'member',
  targetId: 't',
};

describe('writeActionLog (đơn vị)', () => {
  it('ghi actor_type=user và before/after = null khi không truyền', async () => {
    const { tx, values } = fakeTx();
    await writeActionLog(tx, base);
    expect(values).toHaveBeenCalledWith({
      workspaceId: 'w',
      actorType: 'user',
      actorId: 'u',
      action: 'member.role_changed',
      targetType: 'member',
      targetId: 't',
      before: null,
      after: null,
    });
  });

  it('giữ nguyên before/after khi có', async () => {
    const { tx, values } = fakeTx();
    await writeActionLog(tx, { ...base, before: { role: 'staff' }, after: { role: 'owner' } });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ before: { role: 'staff' }, after: { role: 'owner' } }),
    );
  });
});
