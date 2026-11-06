import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listActionLogs } from '../src/queries/action-logs';
import { actionLogs } from '../src/schema/core';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * FR-001 nhật ký kiểm toán thay đổi bảo mật: mỗi thành viên ghi được sự kiện `security.*` của CHÍNH MÌNH vào workspace
 * mình đang ở (cùng đường `withActor` + `writeActionLog` của Server Action), không ghi được vào workspace khác, không
 * giả actor_id của người khác; Staff chỉ thấy dòng của mình, Owner thấy tất cả.
 */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let owner: string;
let staff: string;
let outsider: string;

const entry = (workspaceId: string, actorId: string) => ({
  workspaceId,
  actorType: 'user' as const,
  actorId,
  action: 'security.password_changed',
  targetType: 'user',
  targetId: actorId,
});

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin, 'Chủ A');
  staff = await seedUser(admin, 'Nhân viên A');
  outsider = await seedUser(admin, 'Người ngoài');
  await seedMember(admin, wsA, owner, 'owner');
  await seedMember(admin, wsA, staff, 'staff');
  await seedMember(admin, wsB, outsider, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-001 security audit qua action_logs (RLS)', () => {
  it('FR-001 Staff ghi được sự kiện bảo mật của chính mình; Staff thấy dòng của mình, Owner thấy cả hai', async () => {
    await db.withActor(wsA, staff, (tx) => tx.insert(actionLogs).values(entry(wsA, staff)));
    await db.withActor(wsA, owner, (tx) => tx.insert(actionLogs).values(entry(wsA, owner)));
    const mine = await db.withActor(wsA, staff, (tx) =>
      listActionLogs(tx, wsA, { userId: staff, role: 'staff' }, { limit: 50 }, 'UTC'),
    );
    expect(mine.items.filter((row) => row.action === 'security.password_changed')).toHaveLength(1);
    const all = await db.withActor(wsA, owner, (tx) =>
      listActionLogs(tx, wsA, { userId: owner, role: 'owner' }, { limit: 50 }, 'UTC'),
    );
    expect(all.items.filter((row) => row.action === 'security.password_changed')).toHaveLength(2);
  });

  it('FR-001 không ghi được vào workspace mình không thuộc, không giả actor của người khác', async () => {
    await expect(
      db.withActor(wsA, outsider, (tx) => tx.insert(actionLogs).values(entry(wsA, outsider))),
    ).rejects.toThrow();
    await expect(
      db.withActor(wsA, staff, (tx) => tx.insert(actionLogs).values(entry(wsA, owner))),
    ).rejects.toThrow();
  });
});
