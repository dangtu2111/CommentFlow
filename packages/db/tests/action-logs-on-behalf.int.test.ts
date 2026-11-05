import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * LOG-STAFF-SYSTEM-ROWS (FR-092, migration 0029): cột core.action_logs.on_behalf_of — Staff thấy dòng `system` do CHÍNH MÌNH
 * yêu cầu; không ai tự đặt được người khác ở đường người dùng; cột không sửa được sau khi ghi.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let wsOther: string;
let owner: string;
let staffA: string;
let staffB: string;
let former: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(6);
  ws = await seedWorkspace(admin);
  wsOther = await seedWorkspace(admin);
  owner = await seedUser(admin, 'Chủ');
  staffA = await seedUser(admin, 'Nhân viên A');
  staffB = await seedUser(admin, 'Nhân viên B');
  former = await seedUser(admin, 'Đã rời');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staffA, 'staff');
  await seedMember(admin, ws, staffB, 'staff');
  await seedMember(admin, ws, former, 'staff');
  await seedMember(admin, wsOther, owner, 'owner');
  const rows: Array<[string, string, string | null, string | null, string]> = [
    [ws, 'system', null, staffA, 'sys.for_a'],
    [ws, 'system', null, staffB, 'sys.for_b'],
    [ws, 'system', null, null, 'sys.no_requester'],
    [ws, 'system', null, former, 'sys.for_former'],
    [ws, 'ai', null, null, 'ai.auto_reply'],
    [ws, 'user', staffA, null, 'user.a'],
    [ws, 'user', staffB, null, 'user.b'],
    [wsOther, 'system', null, staffA, 'sys.other_ws_for_a'],
  ];
  for (const [w, type, actor, onBehalf, action] of rows) {
    await admin.query(
      `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action) VALUES ($1, $2, $3, $4, $5)`,
      [w, type, actor, onBehalf, action],
    );
  }
  await admin.query(
    `UPDATE core.members SET status = 'removed' WHERE workspace_id = $1 AND user_id = $2`,
    [ws, former],
  );
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const actionsSeenBy = (userId: string, workspaceId = ws) =>
  db.withActor(workspaceId, userId, async (tx) =>
    (
      await tx.execute<{ action: string }>(sql`SELECT action FROM core.action_logs ORDER BY action`)
    ).rows.map((r) => r.action),
  );

describe('RLS action_logs SELECT với on_behalf_of', () => {
  it('Staff thấy dòng user của mình + dòng system do mình yêu cầu; không thấy system của người khác, system không người yêu cầu, ai', async () => {
    expect(await actionsSeenBy(staffA)).toEqual(['sys.for_a', 'user.a']);
    expect(await actionsSeenBy(staffB)).toEqual(['sys.for_b', 'user.b']);
  });

  it('Owner thấy mọi dòng của workspace (không thấy workspace khác)', async () => {
    expect(await actionsSeenBy(owner)).toEqual([
      'ai.auto_reply',
      'sys.for_a',
      'sys.for_b',
      'sys.for_former',
      'sys.no_requester',
      'user.a',
      'user.b',
    ]);
  });

  it('người đã rời không thấy gì (kể cả dòng system do mình yêu cầu trước đó)', async () => {
    expect(await actionsSeenBy(former)).toEqual([]);
  });

  it('Staff chỉ thấy dòng system theo yêu cầu của mình trong đúng workspace hiện tại', async () => {
    // staffA không là thành viên wsOther → không thấy dòng ở đó dù on_behalf_of = mình
    expect(await actionsSeenBy(staffA, wsOther)).toEqual([]);
  });

  it('withWorkspace trần (không người dùng) không đọc được; đường hệ thống (withJob) đọc được', async () => {
    const bare = await db.withWorkspace(
      ws,
      async (tx) => (await tx.execute(sql`SELECT id FROM core.action_logs`)).rows.length,
    );
    expect(bare).toBe(0);
    const job = await db.withJob(
      ws,
      async (tx) => (await tx.execute(sql`SELECT id FROM core.action_logs`)).rows.length,
    );
    expect(job).toBe(7);
  });
});

describe('ghi on_behalf_of', () => {
  it('đường người dùng (withActor) không INSERT được dòng system/ai (42501)', async () => {
    for (const type of ['system', 'ai']) {
      const code = await expectRejectCode(
        db.withActor(ws, staffA, (tx) =>
          tx.execute(
            sql`INSERT INTO core.action_logs (workspace_id, actor_type, action) VALUES (${ws}::uuid, ${type}, 'x.fake')`,
          ),
        ),
      );
      expect(code).toBe('42501');
    }
  });

  it('withWorkspace TRẦN (không ngữ cảnh hệ thống) không INSERT được dòng system/ai, kể cả có on_behalf_of (42501)', async () => {
    for (const type of ['system', 'ai']) {
      const code = await expectRejectCode(
        db.withWorkspace(ws, (tx) =>
          tx.execute(
            sql`INSERT INTO core.action_logs (workspace_id, actor_type, action) VALUES (${ws}::uuid, ${type}, 'x.bare')`,
          ),
        ),
      );
      expect(code).toBe('42501');
    }
    const forced = await expectRejectCode(
      db.withWorkspace(ws, (tx) =>
        tx.execute(
          sql`INSERT INTO core.action_logs (workspace_id, actor_type, on_behalf_of, action)
              VALUES (${ws}::uuid, 'system', ${staffA}::uuid, 'x.bare')`,
        ),
      ),
    );
    expect(forced).toBe('42501');
  });

  it('dòng user không được đặt on_behalf_of (kể cả = chính mình hay người khác): bị từ chối bởi RLS hoặc CHECK', async () => {
    for (const target of [staffA, staffB]) {
      const code = await expectRejectCode(
        db.withActor(ws, staffA, (tx) =>
          tx.execute(
            sql`INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action)
                VALUES (${ws}::uuid, 'user', ${staffA}::uuid, ${target}::uuid, 'x.fake')`,
          ),
        ),
      );
      expect(['42501', '23514']).toContain(code);
    }
  });

  it('nhánh `on_behalf_of IS NULL` của policy INSERT tự chặn (CHECK được gỡ tạm rồi dựng lại y nguyên): 42501', async () => {
    // cf_owner không SET ROLE cf_app được nên gỡ CHECK thật (commit), thử bằng withActor, rồi dựng lại trong finally.
    // Các file test tích hợp chạy tuần tự (fileParallelism=false) nên không ai khác thấy trạng thái tạm này.
    await admin.query(
      'ALTER TABLE core.action_logs DROP CONSTRAINT action_logs_on_behalf_of_check',
    );
    try {
      const ok = await db.withActor(ws, staffA, (tx) =>
        tx.execute(
          sql`INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES (${ws}::uuid, 'user', ${staffA}::uuid, 'x.ok')`,
        ),
      );
      expect(ok.rowCount).toBe(1); // đối chứng: ngữ cảnh đúng, không đặt on_behalf_of thì policy cho qua
      for (const target of [staffA, staffB]) {
        const code = await expectRejectCode(
          db.withActor(ws, staffA, (tx) =>
            tx.execute(
              sql`INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action)
                  VALUES (${ws}::uuid, 'user', ${staffA}::uuid, ${target}::uuid, 'x.forced')`,
            ),
          ),
        );
        expect(code).toBe('42501'); // do policy (nhánh on_behalf_of IS NULL), không phải CHECK
      }
    } finally {
      await admin.query(
        "ALTER TABLE core.action_logs ADD CONSTRAINT action_logs_on_behalf_of_check CHECK (on_behalf_of IS NULL OR actor_type = 'system') NOT VALID",
      );
      await admin.query(
        'ALTER TABLE core.action_logs VALIDATE CONSTRAINT action_logs_on_behalf_of_check',
      );
    }
  });

  it('CHECK: on_behalf_of chỉ cho actor_type = system, kể cả bằng quyền owner bảng (23514)', async () => {
    for (const type of ['user', 'ai', 'admin']) {
      const code = await expectRejectCode(
        admin.query(
          `INSERT INTO core.action_logs (workspace_id, actor_type, on_behalf_of, action) VALUES ($1, $2, $3, 'x.bad')`,
          [ws, type, staffA],
        ),
      );
      expect(code).toBe('23514');
    }
  });

  it('đường job (withJob) ghi được dòng system kèm on_behalf_of; Staff đó thấy ngay', async () => {
    await db.withJob(ws, (tx) =>
      tx.execute(
        sql`INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, on_behalf_of, action)
            VALUES (${ws}::uuid, 'system', NULL, ${staffA}::uuid, 'comment.replied')`,
      ),
    );
    expect(await actionsSeenBy(staffA)).toContain('comment.replied');
    expect(await actionsSeenBy(staffB)).not.toContain('comment.replied');
  });

  it('cf_app không UPDATE/DELETE action_logs nên on_behalf_of không sửa được sau khi ghi', async () => {
    for (const statement of [
      sql`UPDATE core.action_logs SET on_behalf_of = ${staffB}::uuid WHERE action = 'sys.for_a'`,
      sql`DELETE FROM core.action_logs WHERE action = 'sys.for_a'`,
    ]) {
      expect(await expectRejectCode(db.withJob(ws, (tx) => tx.execute(statement)))).toBe('42501');
    }
  });
});

describe('backfill dòng cũ (câu lệnh của migration 0029)', () => {
  it('điền on_behalf_of từ after.requested_by hợp lệ; rỗng/không phải uuid thì để NULL', async () => {
    const ins = (action: string, after: object | null) =>
      admin.query(
        `INSERT INTO core.action_logs (workspace_id, actor_type, action, after) VALUES ($1, 'system', $2, $3)`,
        [ws, action, after ? JSON.stringify(after) : null],
      );
    await ins('comment.hidden', { requested_by: staffB });
    await ins('comment.unhidden', { requested_by: null });
    await ins('comment.replied', { requested_by: 'khong-phai-uuid' });
    await ins('comment.replied', null);
    await ins('other.action', { requested_by: staffB });
    // Chạy lại đúng câu backfill trong migration (idempotent).
    await admin.query(`
      UPDATE core.action_logs
         SET on_behalf_of = CASE
               WHEN after ->> 'requested_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN (after ->> 'requested_by')::uuid END
       WHERE actor_type = 'system' AND on_behalf_of IS NULL
         AND action IN ('comment.replied', 'comment.hidden', 'comment.unhidden')`);
    const r = await admin.query<{
      action: string;
      on_behalf_of: string | null;
      req: string | null;
    }>(
      `SELECT action, on_behalf_of, after ->> 'requested_by' AS req FROM core.action_logs
        WHERE workspace_id = $1 AND actor_type = 'system' AND after IS DISTINCT FROM NULL AND action IN ('comment.hidden','comment.unhidden','comment.replied','other.action')`,
      [ws],
    );
    const by = (a: string, req: string | null) =>
      r.rows.find((x) => x.action === a && x.req === req)?.on_behalf_of;
    expect(by('comment.hidden', staffB)).toBe(staffB);
    expect(by('comment.unhidden', null)).toBeNull();
    expect(by('comment.replied', 'khong-phai-uuid')).toBeNull();
    expect(by('other.action', staffB)).toBeNull();
  });
});
