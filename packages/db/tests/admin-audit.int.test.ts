import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { checkAdminSession, listAdminAudit, recordAdminAction } from '../src/queries/admin-audit';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * ADMIN-SHELL phần DB (FR-100, FR-118, AUTH-ADMIN-SESSION, Q-ADSH1): phiên Admin 8 giờ kiểm trong DB + nhật ký thao tác
 * Admin chỉ-thêm, chỉ Super Admin đọc. Phiên gieo bằng pool chủ sở hữu (cf_app không ghi được bảng sessions).
 */
const RLS = '42501';
/** Lớp TS đổi SQLSTATE CF401 của DB thành AppError UNAUTHENTICATED; test thô bên dưới kiểm CF401 gốc. */
const SESSION_INVALID = 'UNAUTHENTICATED';
const DB_SESSION_INVALID = 'CF401';
const INVALID_ARG = '22023';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;
let superAdmin: string;
let supportAdmin: string;
let financeAdmin: string;
let plainUser: string;
const sessions: Record<string, string> = {};

async function seedAdmin(role: string | null): Promise<string> {
  const id = await seedUser(admin, `admin-${role}`);
  await admin.query('UPDATE core.users SET is_admin = true, admin_role = $2 WHERE id = $1', [
    id,
    role,
  ]);
  return id;
}

async function seedSession(
  userId: string,
  opts: { isAdminSession?: boolean; expiresInHours?: number; createdHoursAgo?: number } = {},
): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO core.sessions (user_id, token, expires_at, is_admin_session, created_at)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, now() - make_interval(hours => $5))
     RETURNING id`,
    [
      userId,
      randomUUID(),
      opts.expiresInHours ?? 1,
      opts.isAdminSession ?? true,
      opts.createdHoursAgo ?? 0,
    ],
  );
  return (rows[0] as { id: string }).id;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  await seedMember(admin, ws, owner, 'owner');
  plainUser = await seedUser(admin, 'plain');
  superAdmin = await seedAdmin('super');
  supportAdmin = await seedAdmin('support');
  financeAdmin = await seedAdmin('finance');
  sessions.super = await seedSession(superAdmin);
  sessions.support = await seedSession(supportAdmin);
  sessions.finance = await seedSession(financeAdmin);
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

const record = (userId: string, sessionId: string, action = 'workspace.suspend') =>
  db.withUser(userId, (tx) =>
    recordAdminAction(tx, sessionId, {
      action,
      targetType: 'workspace',
      targetId: 'ws-1',
      targetWorkspaceId: ws,
      detail: { reason: 'thử nghiệm' },
    }),
  );

describe('FR-100 phiên Admin kiểm trong DB', () => {
  it('mọi vai trò Admin có phiên hợp lệ → status trả vai trò + hạn ≤ 8 giờ', async () => {
    for (const [role, userId] of [
      ['super', superAdmin],
      ['support', supportAdmin],
      ['finance', financeAdmin],
    ] as const) {
      const status = await db.withUser(userId, (tx) =>
        checkAdminSession(tx, sessions[role] as string),
      );
      expect(status.adminRole).toBe(role);
      expect(status.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(8 * 3_600_000);
    }
  });

  it('người thường / Owner có phiên "Admin" giả → 42501 (không lộ phiên)', async () => {
    const fake = await seedSession(plainUser, { isAdminSession: false });
    for (const userId of [plainUser, owner]) {
      const code = await expectRejectCode(db.withUser(userId, (tx) => checkAdminSession(tx, fake)));
      expect(code).toBe(RLS);
    }
  });

  it('phiên thường của Admin (không phải phiên Admin) → CF401', async () => {
    const normal = await seedSession(superAdmin, { isAdminSession: false });
    expect(
      await expectRejectCode(db.withUser(superAdmin, (tx) => checkAdminSession(tx, normal))),
    ).toBe(SESSION_INVALID);
  });

  it('phiên hết hạn → CF401', async () => {
    const expired = await seedSession(superAdmin, { expiresInHours: -1, createdHoursAgo: 2 });
    expect(
      await expectRejectCode(db.withUser(superAdmin, (tx) => checkAdminSession(tx, expired))),
    ).toBe(SESSION_INVALID);
  });

  it('phiên quá 8 giờ kể từ lúc tạo → CF401 (lớp thứ hai khi expires_at bị đặt xa)', async () => {
    // Trigger cap_admin_session ép expires_at ≤ created_at + 8h nên phiên 9 giờ tuổi đã hết hạn theo cả hai lớp.
    const old = await seedSession(superAdmin, { expiresInHours: 5, createdHoursAgo: 9 });
    expect(
      await expectRejectCode(db.withUser(superAdmin, (tx) => checkAdminSession(tx, old))),
    ).toBe(SESSION_INVALID);
  });

  it('phiên của người khác → CF401; id phiên không tồn tại → CF401', async () => {
    expect(
      await expectRejectCode(
        db.withUser(superAdmin, (tx) => checkAdminSession(tx, sessions.support as string)),
      ),
    ).toBe(SESSION_INVALID);
    expect(
      await expectRejectCode(db.withUser(superAdmin, (tx) => checkAdminSession(tx, randomUUID()))),
    ).toBe(SESSION_INVALID);
  });

  it('hàm DB trả đúng SQLSTATE CF401 cho phiên hết hạn', async () => {
    const expired = await seedSession(superAdmin, { expiresInHours: -1, createdHoursAgo: 2 });
    const code = await expectRejectCode(
      db.withUser(superAdmin, (tx) =>
        tx.execute(sql`SELECT * FROM core.admin_session_status(${expired}::uuid)`),
      ),
    );
    expect(code).toBe(DB_SESSION_INVALID);
  });

  it('trong ngữ cảnh workspace hoặc hệ thống/worker → 42501', async () => {
    const inWorkspace = await expectRejectCode(
      db.withActor(ws, superAdmin, (tx) => checkAdminSession(tx, sessions.super as string)),
    );
    expect(inWorkspace).toBe(RLS);
    const asJob = await expectRejectCode(
      db.withJob(ws, (tx) => checkAdminSession(tx, sessions.super as string)),
    );
    expect(asJob).toBe(RLS);
  });
});

describe('FR-100 ghi nhật ký thao tác Admin', () => {
  it('mọi vai trò Admin ghi được; người thực hiện + vai trò lấy từ DB', async () => {
    const id = await record(supportAdmin, sessions.support as string);
    const { rows } = await admin.query(
      'SELECT actor_user_id, actor_role, session_id, target_workspace_id, detail FROM core.admin_audit_log WHERE id = $1',
      [id],
    );
    expect(rows[0]).toMatchObject({
      actor_user_id: supportAdmin,
      actor_role: 'support',
      session_id: sessions.support,
      target_workspace_id: ws,
      detail: { reason: 'thử nghiệm' },
    });
    await record(financeAdmin, sessions.finance as string, 'payment.confirm');
  });

  it('người thường, Owner, phiên hết hạn, phiên người khác → bị từ chối, không có dòng nào được thêm', async () => {
    const before = await admin.query('SELECT count(*)::int AS n FROM core.admin_audit_log');
    // Trigger cap_admin_session đã cấm tạo phiên Admin cho người thường; phiên thường vẫn không qua được.
    const fake = await seedSession(plainUser, { isAdminSession: false });
    const expired = await seedSession(superAdmin, { expiresInHours: -1, createdHoursAgo: 2 });
    expect(await expectRejectCode(record(plainUser, fake))).toBe(RLS);
    expect(await expectRejectCode(record(owner, fake))).toBe(RLS);
    expect(await expectRejectCode(record(superAdmin, expired))).toBe(SESSION_INVALID);
    expect(await expectRejectCode(record(superAdmin, sessions.support as string))).toBe(
      SESSION_INVALID,
    );
    const after = await admin.query('SELECT count(*)::int AS n FROM core.admin_audit_log');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('đầu vào sai (tên hành động, detail lồng/quá lớn) → 22023', async () => {
    const run = (input: Record<string, unknown>) =>
      expectRejectCode(
        db.withUser(superAdmin, (tx) =>
          tx.execute(sql`SELECT core.record_admin_action(
              ${sessions.super}::uuid, ${String(input.action)}, null, null, null, ${JSON.stringify(input.detail)}::jsonb)`),
        ),
      );
    expect(await run({ action: 'Bad Action', detail: {} })).toBe(INVALID_ARG);
    expect(await run({ action: 'ok.action', detail: [1] })).toBe(INVALID_ARG);
    expect(await run({ action: 'ok.action', detail: { k: 'x'.repeat(2100) } })).toBe(INVALID_ARG);
  });
});

describe('FR-100 bảng chỉ-thêm, không đường trực tiếp', () => {
  it('cf_app / cf_worker không đọc/ghi trực tiếp bảng', async () => {
    const select = await expectRejectCode(
      db.withUser(superAdmin, (tx) => tx.execute(sql`SELECT * FROM core.admin_audit_log`)),
    );
    expect(select).toBe(RLS);
  });

  it('UPDATE / DELETE / TRUNCATE bị trigger chặn kể cả chủ bảng', async () => {
    for (const statement of [
      "UPDATE core.admin_audit_log SET action = 'hacked.action'",
      'DELETE FROM core.admin_audit_log',
      'TRUNCATE core.admin_audit_log',
    ]) {
      await expect(admin.query(statement)).rejects.toMatchObject({ code: RLS });
    }
  });
});

describe('FR-100 đọc nhật ký: chỉ Super Admin', () => {
  it('Super đọc được, mới nhất trước, có phân trang theo mốc thời gian', async () => {
    await record(superAdmin, sessions.super as string, 'flag.update');
    const page = await db.withUser(superAdmin, (tx) =>
      listAdminAudit(tx, sessions.super as string, { limit: 2 }),
    );
    expect(page.length).toBe(2);
    expect(page[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(page[1]?.createdAt.getTime() ?? 0);
    const last = page[page.length - 1];
    const older = await db.withUser(superAdmin, (tx) =>
      listAdminAudit(tx, sessions.super as string, {
        limit: 200,
        before: last ? { createdAt: last.createdAt, id: last.id } : undefined,
      }),
    );
    expect(older.every((r) => r.createdAt < (page[page.length - 1]?.createdAt as Date))).toBe(true);
  });

  it('support / finance (kể cả phiên hợp lệ) → 42501', async () => {
    for (const [role, userId] of [
      ['support', supportAdmin],
      ['finance', financeAdmin],
    ] as const) {
      const code = await expectRejectCode(
        db.withUser(userId, (tx) => listAdminAudit(tx, sessions[role] as string, { limit: 10 })),
      );
      expect(code).toBe(RLS);
    }
  });

  it('limit ngoài 1..200 → 22023 (DB tự chặn dù đi thẳng vào hàm)', async () => {
    for (const limit of [0, 201]) {
      const code = await expectRejectCode(
        db.withUser(superAdmin, (tx) =>
          tx.execute(
            sql`SELECT * FROM core.admin_list_audit(${sessions.super}::uuid, ${limit}, null, null)`,
          ),
        ),
      );
      expect(code).toBe(INVALID_ARG);
    }
  });
});
