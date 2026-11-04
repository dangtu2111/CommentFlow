import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * Ma trận "ai được ghi gì" (feat/rls-actor-ctx): chỉ Owner `active` của workspace W được ghi `members`, đọc/ghi
 * `invitations`, sửa `workspaces`. Mọi người khác (Staff, Owner của workspace KHÁC, tạm khóa, đã gỡ, người lạ, không
 * có người dùng) bị chặn — kể cả khi mã ứng dụng quên kiểm quyền.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
const ids: Record<string, string> = {};
let staffMember: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  for (const name of ['owner', 'staff', 'suspended', 'removed', 'stranger', 'otherOwner']) {
    ids[name] = await seedUser(admin, name);
  }
  await seedMember(admin, ws, ids.owner as string, 'owner');
  staffMember = await seedMember(admin, ws, ids.staff as string, 'staff');
  await seedMember(admin, ws, ids.suspended as string, 'staff');
  await seedMember(admin, ws, ids.removed as string, 'staff');
  await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [
    ids.suspended,
  ]);
  await admin.query("UPDATE core.members SET status = 'removed' WHERE user_id = $1", [ids.removed]);
  await seedMember(admin, other, ids.otherOwner as string, 'owner');
  await admin.query(
    `INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at)
     VALUES ($1, 'moi@example.test', 'staff', $2, now() + interval '1 day')`,
    [ws, `h-${newId()}`],
  );
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

type Who = 'owner' | 'staff' | 'suspended' | 'removed' | 'stranger' | 'otherOwner' | 'noUser';
const WHO: Who[] = ['owner', 'staff', 'suspended', 'removed', 'stranger', 'otherOwner', 'noUser'];

/** Chạy một câu SQL với người gọi `who` ở workspace ws; trả số dòng bị tác động hoặc 'denied'. */
async function run(who: Who, text: string): Promise<number | 'denied'> {
  const exec = (tx: Parameters<Parameters<FlowDb['withWorkspace']>[1]>[0]) =>
    tx.execute(sql.raw(text));
  try {
    const result =
      who === 'noUser'
        ? await db.withWorkspace(ws, exec)
        : await db.withActor(ws, ids[who] as string, exec);
    return result.rowCount ?? result.rows.length;
  } catch (error) {
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code;
    if (code === '42501') return 'denied';
    throw error;
  }
}

/** Chỉ Owner thật của ws được phép; mọi người khác phải bị từ chối hoặc không thấy/sửa được dòng nào. */
function expectOnlyOwner(results: Record<Who, number | 'denied'>, allowedCount: number) {
  for (const who of WHO) {
    if (who === 'owner') expect(results[who], `${who} phải được phép`).toBe(allowedCount);
    else expect([0, 'denied'], `${who} phải bị chặn`).toContain(results[who]);
  }
}

async function matrix(text: (who: Who) => string): Promise<Record<Who, number | 'denied'>> {
  const out = {} as Record<Who, number | 'denied'>;
  for (const who of WHO) out[who] = await run(who, text(who));
  return out;
}

describe('members: chỉ Owner đang hoạt động ghi được', () => {
  it('UPDATE vai trò của một thành viên', async () => {
    const results = await matrix(
      () => `UPDATE core.members SET role = 'staff' WHERE id = '${staffMember}'`,
    );
    expectOnlyOwner(results, 1);
  });

  it('INSERT thành viên mới: KHÔNG AI (kể cả Owner) thêm thẳng được — thành viên chỉ vào qua lời mời', async () => {
    for (const who of WHO) {
      for (const role of ['staff', 'owner']) {
        const fresh = await seedUser(admin, `moi-${who}-${role}`);
        const result = await run(
          who,
          `INSERT INTO core.members (workspace_id, user_id, role) VALUES ('${ws}', '${fresh}', '${role}')`,
        );
        expect(result, `${who} thêm ${role}`).toBe('denied');
      }
    }
  });

  it('đọc danh sách thành viên vẫn mở cho mọi người dùng thuộc workspace (Staff, job hệ thống)', async () => {
    expect(
      await run('staff', `SELECT id FROM core.members WHERE workspace_id = '${ws}'`),
    ).toBeGreaterThan(0);
    expect(
      await run('noUser', `SELECT id FROM core.members WHERE workspace_id = '${ws}'`),
    ).toBeGreaterThan(0);
  });
});

describe('invitations: chỉ Owner đọc/ghi', () => {
  it('SELECT chỉ Owner thấy dòng', async () => {
    const results = await matrix(
      () => `SELECT id FROM core.invitations WHERE workspace_id = '${ws}'`,
    );
    for (const who of WHO) {
      if (who === 'owner') expect(results[who]).toBeGreaterThan(0);
      else expect([0, 'denied']).toContain(results[who]);
    }
  });

  it('INSERT lời mời (invited_by phải là chính người gọi)', async () => {
    const results: Record<string, number | 'denied'> = {};
    for (const who of WHO) {
      // noUser không có id: thử giả người mời là Owner thật
      const inviter = who === 'noUser' ? ids.owner : ids[who];
      results[who] = await run(
        who,
        `INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
         VALUES ('${ws}', '${who}-${newId()}@example.test', 'staff', 'h-${newId()}', now() + interval '1 day', '${inviter}')`,
      );
    }
    expectOnlyOwner(results as Record<Who, number | 'denied'>, 1);
    // Owner giả người mời là người khác → bị chặn
    expect(
      await run(
        'owner',
        `INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
         VALUES ('${ws}', 'gia-${newId()}@example.test', 'staff', 'h-${newId()}', now() + interval '1 day', '${ids.staff}')`,
      ),
    ).toBe('denied');
  });

  it('UPDATE thu hồi lời mời', async () => {
    const results: Record<string, number | 'denied'> = {};
    for (const who of WHO) {
      const inv = await admin.query(
        `INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at)
         VALUES ($1, $2, 'staff', $3, now() + interval '1 day') RETURNING id`,
        [ws, `thuhoi-${who}-${newId()}@example.test`, `h-${newId()}`],
      );
      results[who] = await run(
        who,
        `UPDATE core.invitations SET revoked_at = now() WHERE id = '${inv.rows[0].id}'`,
      );
    }
    expectOnlyOwner(results as Record<Who, number | 'denied'>, 1);
  });

  it('token_hash không đọc được bằng cf_app (kể cả Owner); cột khác thì đọc được', async () => {
    expect(
      await run('owner', `SELECT token_hash FROM core.invitations WHERE workspace_id = '${ws}'`),
    ).toBe('denied');
    expect(
      await run(
        'owner',
        `SELECT id, email, role FROM core.invitations WHERE workspace_id = '${ws}'`,
      ),
    ).toBeGreaterThan(0);
  });
});

describe('workspaces: chỉ Owner sửa', () => {
  it('UPDATE tên workspace', async () => {
    const results = await matrix(
      () => `UPDATE core.workspaces SET name = 'Tên mới' WHERE id = '${ws}'`,
    );
    expectOnlyOwner(results, 1);
  });
});

describe('action_logs: người gọi phải là chính thành viên ghi', () => {
  const insert = (type: string, actor: string | null) =>
    `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES ('${ws}', '${type}', ${
      actor ? `'${actor}'` : 'NULL'
    }, 'thu')`;

  it('actor_type=user: chỉ ghi với actor_id = chính mình VÀ là thành viên đang hoạt động', async () => {
    expect(await run('owner', insert('user', ids.owner as string))).toBe(1);
    expect(await run('staff', insert('user', ids.staff as string))).toBe(1);
    // giả người khác
    expect(await run('staff', insert('user', ids.owner as string))).toBe('denied');
    // không phải thành viên đang hoạt động
    for (const who of ['suspended', 'removed', 'stranger', 'otherOwner'] as const) {
      expect(await run(who, insert('user', ids[who] as string)), who).toBe('denied');
    }
    // không có người dùng mà khai actor_type=user
    expect(await run('noUser', insert('user', ids.owner as string))).toBe('denied');
  });

  it('actor_type khác (system/ai) chỉ qua đường KHÔNG có người dùng', async () => {
    expect(await run('noUser', insert('system', null))).toBe(1);
    expect(await run('owner', insert('system', null))).toBe('denied');
  });
});

describe('đường khởi tạo workspace', () => {
  it('người tạo thành Owner đầu tiên; sau đó người khác không tự phong Owner', async () => {
    const nw = newId();
    const creator = await seedUser(admin, 'nguoi-tao');
    const intruder = await seedUser(admin, 'ke-xam-nhap');
    await db.withActor(nw, creator, async (tx) => {
      await tx.execute(
        sql`INSERT INTO core.workspaces (id, name, slug, created_by) VALUES (${nw}, 'Mới', ${`slug-${nw}`}, ${creator})`,
      );
      await tx.execute(
        sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${nw}, ${creator}, 'owner')`,
      );
    });
    const owners = await admin.query(
      "SELECT user_id FROM core.members WHERE workspace_id = $1 AND role = 'owner'",
      [nw],
    );
    expect(owners.rows.map((r) => r.user_id)).toEqual([creator]);

    for (const run2 of [
      () =>
        db.withActor(nw, intruder, (tx) =>
          tx.execute(
            sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${nw}, ${intruder}, 'owner')`,
          ),
        ),
      () =>
        db.withWorkspace(nw, (tx) =>
          tx.execute(
            sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${nw}, ${intruder}, 'owner')`,
          ),
        ),
    ]) {
      expect(await expectRejectCode(run2())).toBe('42501');
    }
  });

  it('workspace TRỐNG do người tạo ghi created_by: chỉ chính người tạo, chỉ vai trò owner, không phong người khác', async () => {
    const nw = newId();
    const a = await seedUser(admin, 'a');
    const b = await seedUser(admin, 'b');
    await admin.query(
      'INSERT INTO core.workspaces (id, name, slug, created_by) VALUES ($1, $2, $3, $4)',
      [nw, 'Trống', `slug-${nw}`, a],
    );
    const attempt = (actor: string, user: string, role: string) =>
      expectRejectCode(
        db.withActor(nw, actor, (tx) =>
          tx.execute(
            sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${nw}, ${user}, ${role})`,
          ),
        ),
      );
    expect(await attempt(a, b, 'owner')).toBe('42501'); // phong người khác
    expect(await attempt(a, a, 'staff')).toBe('42501'); // không phải đường khởi tạo Owner
    expect(await attempt(b, b, 'owner')).toBe('42501'); // không phải người tạo workspace này
    expect(await attempt(a, a, 'owner')).toBeUndefined(); // đúng người tạo, đúng đường khởi tạo
  });

  it('workspace TRỐNG KHÔNG do ai tạo (seed/Admin/job, created_by NULL): không ai chiếm được Owner', async () => {
    const nw = newId();
    const a = await seedUser(admin, 'a2');
    await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
      nw,
      'Mồ côi',
      `slug-${nw}`,
    ]);
    expect(
      await expectRejectCode(
        db.withActor(nw, a, (tx) =>
          tx.execute(
            sql`INSERT INTO core.members (workspace_id, user_id, role) VALUES (${nw}, ${a}, 'owner')`,
          ),
        ),
      ),
    ).toBe('42501');
  });

  it('workspaces INSERT: created_by phải là người gọi (không ghi tên người khác làm người tạo)', async () => {
    const nw = newId();
    const a = await seedUser(admin, 'a3');
    const b = await seedUser(admin, 'b3');
    expect(
      await expectRejectCode(
        db.withActor(nw, a, (tx) =>
          tx.execute(
            sql`INSERT INTO core.workspaces (id, name, slug, created_by) VALUES (${nw}, 'X', ${`slug-${nw}`}, ${b})`,
          ),
        ),
      ),
    ).toBe('42501');
  });

  it('members: cf_app không đổi được user_id/invited_by của dòng (chuyển ghế Owner / giả người mời)', async () => {
    const tgt = await seedUser(admin, 'doi-user');
    for (const set of [
      `user_id = '${tgt}'`,
      `invited_by = '${tgt}'`,
      `workspace_id = '${other}'`,
    ]) {
      expect(await run('owner', `UPDATE core.members SET ${set} WHERE id = '${staffMember}'`)).toBe(
        'denied',
      );
    }
  });

  it('action_logs: actor_type admin hoặc system kèm actor_id (khi không có người dùng) bị chặn', async () => {
    const ins = (type: string, actor: string | null) =>
      `INSERT INTO core.action_logs (workspace_id, actor_type, actor_id, action) VALUES ('${ws}', '${type}', ${actor ? `'${actor}'` : 'NULL'}, 'thu')`;
    expect(await run('noUser', ins('admin', null))).toBe('denied');
    expect(await run('noUser', ins('system', ids.owner as string))).toBe('denied');
    expect(await run('noUser', ins('ai', null))).toBe(1);
  });
});

describe('ngữ cảnh', () => {
  it('withActor kiểm UUID và đặt lại biến ngữ cảnh giữa các giao dịch', async () => {
    await expect(
      db.withActor('không-phải-uuid', ids.owner as string, async () => 1),
    ).rejects.toThrow();
    await expect(db.withActor(ws, 'không-phải-uuid', async () => 1)).rejects.toThrow();
    // sau một giao dịch withActor, withWorkspace thuần không thừa hưởng app.user_id
    await db.withActor(ws, ids.owner as string, async () => 1);
    const r = await db.withWorkspace(ws, (tx) =>
      tx.execute(sql`SELECT core.current_user_id() AS u`),
    );
    expect(r.rows[0]?.u).toBeNull();
  });

  it('Owner của workspace KHÁC dùng id của ws bị chặn ghi dù là Owner ở workspace của mình', async () => {
    expect(
      await run('otherOwner', `UPDATE core.workspaces SET name = 'x' WHERE id = '${ws}'`),
    ).not.toBe(1);
  });
});
