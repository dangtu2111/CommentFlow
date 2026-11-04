import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listChannelAlerts } from '../src/queries/channel-alerts';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** CH-STATUS-BANNER (FR-012): kênh cần chú ý (expired/revoked/error) của workspace — chỉ đọc, cô lập workspace. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let member: string;
let stranger: string;

async function channel(workspaceId: string, name: string, status: string, platform = 'facebook') {
  await admin.query(
    'INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, $2, $3, $4, $5)',
    [workspaceId, platform, `ext-${randomUUID()}`, name, status],
  );
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  member = await seedUser(admin, 'm');
  stranger = await seedUser(admin, 's');
  await seedMember(admin, ws, member, 'staff');
  await channel(ws, 'Shop Hoa', 'connected');
  await channel(ws, 'Shop Bánh', 'expired');
  await channel(ws, 'Shop An', 'revoked');
  await channel(ws, 'Shop Zed', 'error', 'instagram');
  await channel(other, 'Kênh người khác', 'expired');
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-012 listChannelAlerts', () => {
  it('chỉ trả kênh expired/revoked/error của workspace, sắp theo tên; không có kênh connected', async () => {
    const alerts = await db.withActor(ws, member, (tx) => listChannelAlerts(tx, ws));
    expect(alerts.map((a) => [a.name, a.status, a.platform])).toEqual([
      ['Shop An', 'revoked', 'facebook'],
      ['Shop Bánh', 'expired', 'facebook'],
      ['Shop Zed', 'error', 'instagram'],
    ]);
    expect(alerts.every((a) => Object.keys(a).sort().join() === 'id,name,platform,status')).toBe(
      true,
    );
  });

  it('không rò kênh workspace khác (kể cả truyền id workspace khác); người ngoài workspace → rỗng', async () => {
    expect(await db.withActor(ws, member, (tx) => listChannelAlerts(tx, other))).toEqual([]);
    expect(await db.withActor(ws, stranger, (tx) => listChannelAlerts(tx, ws))).toEqual([]);
  });

  it('workspace không có kênh lỗi → rỗng', async () => {
    const clean = await seedWorkspace(admin);
    const u = await seedUser(admin, 'clean');
    await seedMember(admin, clean, u, 'owner');
    await channel(clean, 'OK', 'connected');
    expect(await db.withActor(clean, u, (tx) => listChannelAlerts(tx, clean))).toEqual([]);
  });
});
