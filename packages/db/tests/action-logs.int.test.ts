import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  type ActionLogViewer,
  getActionLog,
  listActionLogActions,
  listActionLogs,
} from '../src/queries/action-logs';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * LOG-PAGE (FR-092): Owner thấy mọi dòng, Staff chỉ dòng của chính mình, cô lập workspace, lọc, phân trang con trỏ.
 */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let owner: string;
let staff1: string;
let staff2: string;
let ownerB: string;
const base = Date.UTC(2026, 10, 1, 8, 0, 0);
const ids: Record<string, string> = {};

async function log(input: {
  ws: string;
  type: 'user' | 'ai' | 'system';
  actor?: string | null;
  action: string;
  minutes: number;
  key: string;
  before?: object;
  after?: object;
}): Promise<void> {
  const r = await admin.query(
    `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action, target_type, target_id, before, after, created_at)
     VALUES ($1, $2, $3, $4, 'member', 't1', $5, $6, $7) RETURNING id`,
    [
      input.ws,
      input.type,
      input.actor ?? null,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      new Date(base + input.minutes * 60_000),
    ],
  );
  ids[input.key] = r.rows[0].id;
}

const as = <T>(userId: string, ws: string, fn: Parameters<FlowDb['withActor']>[2]) =>
  db.withActor(ws, userId, fn) as Promise<T>;
const viewerOwner = (): ActionLogViewer => ({ userId: owner, role: 'owner' });
const viewerStaff = (userId: string): ActionLogViewer => ({ userId, role: 'staff' });

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin, 'Chủ A');
  staff1 = await seedUser(admin, 'Nhân viên 1');
  staff2 = await seedUser(admin, 'Nhân viên 2');
  ownerB = await seedUser(admin, 'Chủ B');
  await seedMember(admin, wsA, owner, 'owner');
  await seedMember(admin, wsA, staff1, 'staff');
  await seedMember(admin, wsA, staff2, 'staff');
  await seedMember(admin, wsB, ownerB, 'owner');
  await log({
    ws: wsA,
    type: 'user',
    actor: owner,
    action: 'member.role_changed',
    minutes: 0,
    key: 'o1',
    before: { role: 'staff' },
    after: { role: 'owner' },
  });
  await log({
    ws: wsA,
    type: 'user',
    actor: staff1,
    action: 'comment.reply_requested',
    minutes: 1,
    key: 's1a',
  });
  await log({
    ws: wsA,
    type: 'user',
    actor: staff2,
    action: 'comment.reply_requested',
    minutes: 2,
    key: 's2a',
  });
  await log({ ws: wsA, type: 'system', action: 'workspace.created', minutes: 3, key: 'sys' });
  await log({ ws: wsA, type: 'ai', action: 'ai.auto_reply', minutes: 4, key: 'ai' });
  await log({
    ws: wsA,
    type: 'user',
    actor: staff1,
    action: 'channel.connected',
    minutes: 5,
    key: 's1b',
  });
  await log({
    ws: wsB,
    type: 'user',
    actor: ownerB,
    action: 'workspace.created',
    minutes: 6,
    key: 'b1',
  });
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

const run = (viewer: ActionLogViewer, ws: string, filter = {}) =>
  as<Awaited<ReturnType<typeof listActionLogs>>>(viewer.userId, ws, (tx) =>
    listActionLogs(tx, ws, viewer, filter, 'Asia/Ho_Chi_Minh'),
  );
const keysOf = (items: { id: string }[]) =>
  items.map((i) => Object.entries(ids).find(([, v]) => v === i.id)?.[0]);

describe('FR-092 quyền xem nhật ký', () => {
  it('FR-092 Owner thấy mọi dòng của workspace, mới nhất trước, không thấy workspace khác', async () => {
    const page = await run(viewerOwner(), wsA);
    expect(keysOf(page.items)).toEqual(['s1b', 'ai', 'sys', 's2a', 's1a', 'o1']);
  });

  it('FR-092 Staff chỉ thấy dòng do chính mình thực hiện (không thấy AI/hệ thống/người khác)', async () => {
    const page = await run(viewerStaff(staff1), wsA);
    expect(keysOf(page.items)).toEqual(['s1b', 's1a']);
    expect(page.items.every((i) => i.actorId === staff1 && i.actorName === 'Nhân viên 1')).toBe(
      true,
    );
  });

  it('FR-092 Staff đặt bộ lọc tác nhân khác vẫn chỉ thu hẹp, không mở rộng quyền', async () => {
    expect((await run(viewerStaff(staff1), wsA, { actorType: 'system' })).items).toEqual([]);
    expect((await run(viewerStaff(staff1), wsA, { actorType: 'ai' })).items).toEqual([]);
    expect(keysOf((await run(viewerStaff(staff1), wsA, { actorType: 'user' })).items)).toEqual([
      's1b',
      's1a',
    ]);
  });

  it('FR-092 chi tiết: Staff mở id dòng của người khác thì null; Owner mở được và thấy trước/sau', async () => {
    const other = ids.s2a as string;
    const hidden = await as<unknown>(staff1, wsA, (tx) =>
      getActionLog(tx, wsA, viewerStaff(staff1), other),
    );
    expect(hidden).toBeNull();
    const detail = await as<Awaited<ReturnType<typeof getActionLog>>>(owner, wsA, (tx) =>
      getActionLog(tx, wsA, viewerOwner(), ids.o1 as string),
    );
    expect(detail?.before).toEqual({ role: 'staff' });
    expect(detail?.after).toEqual({ role: 'owner' });
    expect(detail?.actorName).toBe('Chủ A');
  });

  it('FR-092 cô lập workspace: id của workspace khác không đọc được dù là Owner', async () => {
    const other = await as<unknown>(owner, wsA, (tx) =>
      getActionLog(tx, wsA, viewerOwner(), ids.b1 as string),
    );
    expect(other).toBeNull();
    const asOwnerB = await run({ userId: ownerB, role: 'owner' }, wsB);
    expect(keysOf(asOwnerB.items)).toEqual(['b1']);
    // Owner A hỏi workspace B trong ngữ cảnh A: RLS + điều kiện workspace thì rỗng.
    const crossed = await as<Awaited<ReturnType<typeof listActionLogs>>>(owner, wsA, (tx) =>
      listActionLogs(tx, wsB, viewerOwner(), {}, 'UTC'),
    );
    expect(crossed.items).toEqual([]);
  });

  it('FR-092 danh sách hành động cho ô lọc cũng theo quyền xem', async () => {
    const ownerActions = await as<string[]>(owner, wsA, (tx) =>
      listActionLogActions(tx, wsA, viewerOwner()),
    );
    expect(ownerActions).toContain('ai.auto_reply');
    const staffActions = await as<string[]>(staff1, wsA, (tx) =>
      listActionLogActions(tx, wsA, viewerStaff(staff1)),
    );
    expect(staffActions).toEqual(['channel.connected', 'comment.reply_requested']);
  });
});

describe('FR-092 lọc và phân trang', () => {
  it('FR-092 lọc theo loại tác nhân và theo hành động', async () => {
    expect(keysOf((await run(viewerOwner(), wsA, { actorType: 'ai' })).items)).toEqual(['ai']);
    expect(
      keysOf((await run(viewerOwner(), wsA, { action: 'comment.reply_requested' })).items),
    ).toEqual(['s2a', 's1a']);
  });

  it('FR-092 lọc theo ngày theo múi giờ workspace (15:00 ngày 01/11 giờ VN; ngày 02/11 rỗng)', async () => {
    const day = await run(viewerOwner(), wsA, { fromDate: '2026-11-01', toDate: '2026-11-01' });
    expect(day.items).toHaveLength(6);
    expect((await run(viewerOwner(), wsA, { fromDate: '2026-11-02' })).items).toEqual([]);
    expect((await run(viewerOwner(), wsA, { toDate: '2026-10-31' })).items).toEqual([]);
  });

  it('FR-092 phân trang con trỏ không mất/trùng dòng', async () => {
    const first = await run(viewerOwner(), wsA, { limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await run(viewerOwner(), wsA, { limit: 4, cursor: first.nextCursor });
    expect(keysOf([...first.items, ...second.items])).toEqual([
      's1b',
      'ai',
      'sys',
      's2a',
      's1a',
      'o1',
    ]);
    expect(second.nextCursor).toBeNull();
  });
});
