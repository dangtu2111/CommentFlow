import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  createAuthTestDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * MEMBER-LEAVE (FR-003) + LOG-RLS-STAFF (FR-092): hàm core.leave_workspace và policy đọc action_logs (migration 0028).
 */
let admin: pg.Pool;
let db: FlowDb;

beforeAll(() => {
  admin = createAdminPool();
  db = createAppDb(8);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const CHECK_VIOLATION = '23514';
const NOT_ALLOWED = '42501';
const NOT_A_MEMBER = 'CF404';

const leave = (userId: string, ws: string) =>
  db.withUser(userId, async (tx) => {
    const result = await tx.execute<{ left_role: string }>(
      sql`SELECT * FROM core.leave_workspace(${ws}::uuid)`,
    );
    return result.rows;
  });

async function newWorkspace(roles: Array<'owner' | 'staff'>) {
  const ws = await seedWorkspace(admin);
  const people: Array<{ id: string; memberId: string }> = [];
  for (const role of roles) {
    const id = await seedUser(admin);
    people.push({ id, memberId: await seedMember(admin, ws, id, role) });
  }
  return { ws, people };
}

const statusOf = async (memberId: string): Promise<string> =>
  (await admin.query('SELECT status FROM core.members WHERE id = $1', [memberId])).rows[0].status;

describe('core.leave_workspace: cấu hình bảo mật', () => {
  it('SECURITY DEFINER, search_path cố định, chỉ cf_app EXECUTE, MỘT tham số workspace (không user id)', async () => {
    const { rows } = await admin.query(
      `SELECT p.prosecdef, p.proconfig, p.proacl::text AS acl,
              has_function_privilege('cf_app', p.oid, 'EXECUTE') AS app_ok,
              has_function_privilege('cf_auth', p.oid, 'EXECUTE') AS auth_ok,
              pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p WHERE p.pronamespace = 'core'::regnamespace AND p.proname = 'leave_workspace'`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.prosecdef).toBe(true);
    expect(row.proconfig).toContain('search_path=pg_catalog, core, cf, pg_temp');
    expect(row.acl).not.toMatch(/(^|[{,])=X/);
    expect(row.app_ok).toBe(true);
    expect(row.auth_ok).toBe(false);
    expect(row.args).toBe('p_workspace_id uuid');
  });

  it('cf_auth không gọi được hàm', async () => {
    const authDb = createAuthTestDb(1);
    try {
      const { ws } = await newWorkspace(['owner', 'staff']);
      const code = await expectRejectCode(
        authDb.transaction((tx) =>
          tx.execute(sql`SELECT * FROM core.leave_workspace(${ws}::uuid)`),
        ),
      );
      expect(code).toBe(NOT_ALLOWED);
    } finally {
      await authDb.close();
    }
  });

  it('không có người dùng trong ngữ cảnh (withSystem/withWorkspace) → 42501, không ai bị gỡ', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const staff = people[1];
    if (!staff) throw new Error('seed');
    expect(
      await expectRejectCode(
        db.withSystem((tx) => tx.execute(sql`SELECT * FROM core.leave_workspace(${ws}::uuid)`)),
      ),
    ).toBe(NOT_ALLOWED);
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          tx.execute(sql`SELECT * FROM core.leave_workspace(${ws}::uuid)`),
        ),
      ),
    ).toBe(NOT_ALLOWED);
    expect(await statusOf(staff.memberId)).toBe('active');
  });

  it('ngữ cảnh workspace khác với tham số → 42501', async () => {
    const a = await newWorkspace(['owner', 'staff']);
    const b = await newWorkspace(['owner']);
    const staff = a.people[1];
    if (!staff) throw new Error('seed');
    const code = await expectRejectCode(
      db.withActor(b.ws, staff.id, (tx) =>
        tx.execute(sql`SELECT * FROM core.leave_workspace(${a.ws}::uuid)`),
      ),
    );
    expect(code).toBe(NOT_ALLOWED);
    expect(await statusOf(staff.memberId)).toBe('active');
  });
});

describe('core.leave_workspace: quy tắc rời', () => {
  it('Staff rời được: removed, ghi member.left (actor = chính người đó), Owner không đổi', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const [owner, staff] = people;
    if (!owner || !staff) throw new Error('seed');
    const rows = await leave(staff.id, ws);
    expect(rows).toEqual([{ left_role: 'staff' }]);
    expect(await statusOf(staff.memberId)).toBe('removed');
    expect(await statusOf(owner.memberId)).toBe('active');
    const log = await admin.query(
      `SELECT actor_type, actor_id, target_type, target_id, before, after
       FROM core.action_logs WHERE workspace_id = $1 AND action = 'member.left'`,
      [ws],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({
      actor_type: 'user',
      actor_id: staff.id,
      target_type: 'member',
      target_id: staff.memberId,
      before: { role: 'staff', status: 'active' },
      after: { role: 'staff', status: 'removed' },
    });
  });

  it('Owner cuối cùng bị chặn (members_last_owner), dòng không đổi, không ghi nhật ký', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const [owner] = people;
    if (!owner) throw new Error('seed');
    const code = await expectRejectCode(leave(owner.id, ws));
    expect(code).toBe(CHECK_VIOLATION);
    expect(await statusOf(owner.memberId)).toBe('active');
    const logs = await admin.query(
      `SELECT count(*)::int AS n FROM core.action_logs WHERE workspace_id = $1 AND action = 'member.left'`,
      [ws],
    );
    expect(logs.rows[0].n).toBe(0);
  });

  it('Owner chỉ còn Owner KHÁC đang bị tạm khóa vẫn bị chặn; có Owner active khác thì rời được', async () => {
    const { ws, people } = await newWorkspace(['owner', 'owner']);
    const [first, second] = people;
    if (!first || !second) throw new Error('seed');
    await admin.query(`UPDATE core.members SET status = 'suspended' WHERE id = $1`, [
      second.memberId,
    ]);
    expect(await expectRejectCode(leave(first.id, ws))).toBe(CHECK_VIOLATION);
    await admin.query(`UPDATE core.members SET status = 'active' WHERE id = $1`, [second.memberId]);
    expect(await leave(first.id, ws)).toEqual([{ left_role: 'owner' }]);
    expect(await statusOf(first.memberId)).toBe('removed');
    expect(await statusOf(second.memberId)).toBe('active');
  });

  it('không phải thành viên (hoặc đã rời) → CF404; rời lần hai không ghi thêm nhật ký', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const staff = people[1];
    if (!staff) throw new Error('seed');
    const stranger = await seedUser(admin);
    expect(await expectRejectCode(leave(stranger, ws))).toBe(NOT_A_MEMBER);
    await leave(staff.id, ws);
    expect(await expectRejectCode(leave(staff.id, ws))).toBe(NOT_A_MEMBER);
    const logs = await admin.query(
      `SELECT count(*)::int AS n FROM core.action_logs WHERE workspace_id = $1 AND action = 'member.left'`,
      [ws],
    );
    expect(logs.rows[0].n).toBe(1);
  });

  it('thành viên đang bị tạm khóa không tự rời được (CF404)', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const staff = people[1];
    if (!staff) throw new Error('seed');
    await admin.query(`UPDATE core.members SET status = 'suspended' WHERE id = $1`, [
      staff.memberId,
    ]);
    expect(await expectRejectCode(leave(staff.id, ws))).toBe(NOT_A_MEMBER);
    expect(await statusOf(staff.memberId)).toBe('suspended');
  });

  it('workspace khác không bị ảnh hưởng: người ở hai workspace chỉ rời workspace được chỉ định', async () => {
    const a = await newWorkspace(['owner', 'staff']);
    const b = await newWorkspace(['owner']);
    const staff = a.people[1];
    if (!staff) throw new Error('seed');
    const inB = await seedMember(admin, b.ws, staff.id, 'staff');
    await leave(staff.id, a.ws);
    expect(await statusOf(staff.memberId)).toBe('removed');
    expect(await statusOf(inB)).toBe('active');
  });

  it('race: hai Owner (chỉ có hai) rời cùng lúc → đúng một bên thành công, luôn còn một Owner active', async () => {
    for (let round = 0; round < 5; round += 1) {
      const { ws, people } = await newWorkspace(['owner', 'owner']);
      const [first, second] = people;
      if (!first || !second) throw new Error('seed');
      const results = await Promise.allSettled([leave(first.id, ws), leave(second.id, ws)]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      const remaining = await admin.query(
        `SELECT count(*)::int AS n FROM core.members WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'`,
        [ws],
      );
      expect(remaining.rows[0].n).toBe(1);
    }
  });
});

describe('race: Owner rời trong khi Owner khác bị hạ/gỡ cùng lúc', () => {
  it.each(['removed', 'suspended'] as const)(
    'A rời song song với việc A đặt Owner B thành %s → luôn còn ít nhất một Owner active',
    async (status) => {
      for (let round = 0; round < 5; round += 1) {
        const { ws, people } = await newWorkspace(['owner', 'owner']);
        const [a, b] = people;
        if (!a || !b) throw new Error('seed');
        await Promise.allSettled([
          leave(a.id, ws),
          db.withActor(ws, a.id, (tx) =>
            tx.execute(
              sql`UPDATE core.members SET status = ${status} WHERE id = ${b.memberId}::uuid`,
            ),
          ),
        ]);
        const remaining = await admin.query(
          `SELECT count(*)::int AS n FROM core.members WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'`,
          [ws],
        );
        expect(remaining.rows[0].n).toBeGreaterThanOrEqual(1);
      }
    },
  );
});

describe('người đã rời không còn thấy dữ liệu workspace', () => {
  it('không còn là thành viên active, không đọc được action_logs, không ghi nhật ký giả danh được', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const [owner, staff] = people;
    if (!owner || !staff) throw new Error('seed');
    await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES ($1, 'user', $2, 'x.before')`,
      [ws, staff.id],
    );
    await leave(staff.id, ws);
    const view = await db.withActor(ws, staff.id, async (tx) => ({
      member: (await tx.execute<{ ok: boolean }>(sql`SELECT core.is_workspace_member() AS ok`))
        .rows[0]?.ok,
      logs: (await tx.execute(sql`SELECT id FROM core.action_logs`)).rows.length,
    }));
    expect(view).toEqual({ member: false, logs: 0 });
    const mine = await db.withUser(staff.id, async (tx) =>
      (
        await tx.execute(
          sql`SELECT workspace_id FROM core.members WHERE user_id = ${staff.id}::uuid AND status = 'active'`,
        )
      ).rows.filter((r) => r.workspace_id === ws),
    );
    expect(mine).toEqual([]);
    const code = await expectRejectCode(
      db.withActor(ws, staff.id, (tx) =>
        tx.execute(
          sql`INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES (${ws}::uuid, 'user', ${staff.id}::uuid, 'x.after')`,
        ),
      ),
    );
    expect(code).toBe(NOT_ALLOWED);
  });
});

describe('RLS action_logs SELECT (LOG-RLS-STAFF)', () => {
  it('Owner thấy mọi dòng workspace; Staff chỉ dòng user của chính mình; không thấy workspace khác', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff', 'staff']);
    const [owner, staff1, staff2] = people;
    if (!owner || !staff1 || !staff2) throw new Error('seed');
    const other = await newWorkspace(['owner']);
    const ins = (workspace: string, type: string, actor: string | null, action: string) =>
      admin.query(
        `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES ($1, $2, $3, $4)`,
        [workspace, type, actor, action],
      );
    await ins(ws, 'user', owner.id, 'a.owner');
    await ins(ws, 'user', staff1.id, 'a.staff1');
    await ins(ws, 'user', staff2.id, 'a.staff2');
    await ins(ws, 'system', null, 'a.system');
    await ins(ws, 'ai', null, 'a.ai');
    await ins(other.ws, 'system', null, 'b.system');
    const actions = (userId: string) =>
      db.withActor(ws, userId, async (tx) =>
        (
          await tx.execute<{ action: string }>(
            sql`SELECT action FROM core.action_logs ORDER BY action`,
          )
        ).rows.map((r) => r.action),
      );
    expect(await actions(owner.id)).toEqual([
      'a.ai',
      'a.owner',
      'a.staff1',
      'a.staff2',
      'a.system',
    ]);
    expect(await actions(staff1.id)).toEqual(['a.staff1']);
    expect(await actions(staff2.id)).toEqual(['a.staff2']);
  });

  it("Staff không thấy dòng actor_type='admin' hay dòng 'user' không có actor_id", async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const staff = people[1];
    if (!staff) throw new Error('seed');
    await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES
         ($1, 'admin', NULL, 'z.admin'), ($1, 'user', NULL, 'z.user_null'), ($1, 'user', $2, 'z.mine')`,
      [ws, staff.id],
    );
    const seen = await db.withActor(ws, staff.id, async (tx) =>
      (await tx.execute<{ action: string }>(sql`SELECT action FROM core.action_logs`)).rows.map(
        (r) => r.action,
      ),
    );
    expect(seen).toEqual(['z.mine']);
  });

  it('Staff không đọc được dòng của người khác dù lọc theo id (RLS, không chỉ truy vấn)', async () => {
    const { ws, people } = await newWorkspace(['owner', 'staff']);
    const [owner, staff] = people;
    if (!owner || !staff) throw new Error('seed');
    const row = await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES ($1, 'user', $2, 'a.owner') RETURNING id`,
      [ws, owner.id],
    );
    const id = row.rows[0].id as string;
    const seen = await db.withActor(
      ws,
      staff.id,
      async (tx) =>
        (await tx.execute(sql`SELECT id FROM core.action_logs WHERE id = ${id}::uuid`)).rows.length,
    );
    expect(seen).toBe(0);
  });

  it('đường hệ thống (withJob) đọc được; withWorkspace trần không đọc được', async () => {
    const { ws } = await newWorkspace(['owner']);
    await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, action) VALUES ($1, 'system', 'a.system')`,
      [ws],
    );
    const viaJob = await db.withJob(
      ws,
      async (tx) => (await tx.execute(sql`SELECT id FROM core.action_logs`)).rows.length,
    );
    const bare = await db.withWorkspace(
      ws,
      async (tx) => (await tx.execute(sql`SELECT id FROM core.action_logs`)).rows.length,
    );
    expect(viaJob).toBe(1);
    expect(bare).toBe(0);
  });
});
