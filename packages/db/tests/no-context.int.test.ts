import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

let admin: pg.Pool;
let db: FlowDb;

/** Mọi bảng có RLS mà cf_app đọc được (workspace + xác thực). verifications: cf_app không có quyền nào (xem auth-rls). */
const RLS_TABLES = [
  'core.workspaces',
  'core.members',
  'core.invitations',
  'core.feature_flag_overrides',
  'core.action_logs',
  'cf.ai_usage',
  'core.users',
  'core.sessions',
  'core.accounts',
];
const ALL_TABLES_WITH_DATA = [...RLS_TABLES, 'core.verifications'];

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(1); // 1 kết nối duy nhất để bắt rò/đầu độc ngữ cảnh
  // Gieo ít nhất một dòng cho MỌI bảng (bằng quyền chủ sở hữu) để "0 dòng" mang ý nghĩa thật.
  const ws = await seedWorkspace(admin);
  const user = await seedUser(admin);
  await seedMember(admin, ws, user, 'owner');
  await admin.query(
    "INSERT INTO core.invitations (workspace_id, email, role, token_hash, expires_at) VALUES ($1, $2, 'staff', $3, now() + interval '1 day')",
    [ws, `${randomUUID()}@example.test`, randomUUID()],
  );
  await admin.query(
    "INSERT INTO core.feature_flags (key, product, kind) VALUES ($1, 'commentflow', 'ops') ON CONFLICT DO NOTHING",
    ['cf.no-context'],
  );
  await admin.query(
    'INSERT INTO core.feature_flag_overrides (flag_key, workspace_id, enabled) VALUES ($1, $2, true)',
    ['cf.no-context', ws],
  );
  await admin.query(
    "INSERT INTO core.action_logs (workspace_id, actor_type, action) VALUES ($1, 'system', 'thu')",
    [ws],
  );
  await admin.query("INSERT INTO cf.ai_usage (workspace_id, step, model) VALUES ($1, 's', 'm')", [
    ws,
  ]);
  await admin.query(
    "INSERT INTO core.sessions (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    [user, randomUUID()],
  );
  await admin.query(
    "INSERT INTO core.accounts (user_id, provider_id, account_id) VALUES ($1, 'credential', $2)",
    [user, user],
  );
  await admin.query(
    "INSERT INTO core.verifications (identifier, value, expires_at) VALUES ($1, 'v', now() + interval '1 hour')",
    [randomUUID()],
  );
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const count = async (
  table: string,
  run: (q: ReturnType<typeof sql.raw>) => Promise<{ rows: Record<string, unknown>[] }>,
) => Number((await run(sql.raw(`SELECT count(*)::int AS n FROM ${table}`))).rows[0]?.n);

describe('mọi bảng RLS: không ngữ cảnh / ngữ cảnh lạ → 0 dòng (dù chủ sở hữu thấy dữ liệu thật)', () => {
  it('chủ sở hữu thấy dữ liệu ở mọi bảng (bảo đảm phép thử có ý nghĩa)', async () => {
    for (const table of ALL_TABLES_WITH_DATA) {
      const { rows } = await admin.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0].n, table).toBeGreaterThan(0);
    }
  });

  it('không ngữ cảnh (withSystem) → 0 dòng ở mọi bảng', async () => {
    for (const table of RLS_TABLES) {
      expect(await db.withSystem((tx) => count(table, (q) => tx.execute(q))), table).toBe(0);
    }
  });

  it('workspace lạ (không có dữ liệu) → 0 dòng ở mọi bảng nghiệp vụ và bảng xác thực', async () => {
    for (const table of RLS_TABLES) {
      expect(
        await db.withWorkspace(randomUUID(), (tx) => count(table, (q) => tx.execute(q))),
        table,
      ).toBe(0);
    }
  });

  it('người dùng lạ (withUser) → 0 dòng ở mọi bảng', async () => {
    for (const table of RLS_TABLES) {
      expect(
        await db.withUser(randomUUID(), (tx) => count(table, (q) => tx.execute(q))),
        table,
      ).toBe(0);
    }
  });
});

describe('ngữ cảnh bị "đầu độc" ở cấp phiên không đi vào giao dịch thường (phòng thủ lớp hai)', () => {
  it('SET app.ctx = auth ở cấp phiên rồi dùng withSystem/withWorkspace → vẫn 0 dòng', async () => {
    await db.system.execute(sql`select set_config('app.ctx', 'auth', false)`);
    await db.system.execute(sql`select set_config('app.user_id', ${randomUUID()}, false)`);
    expect(await db.withSystem((tx) => count('core.sessions', (q) => tx.execute(q)))).toBe(0);
    expect(
      await db.withWorkspace(randomUUID(), (tx) => count('core.users', (q) => tx.execute(q))),
    ).toBe(0);
    // withUser vẫn chỉ thấy dòng của chính người dùng đó (không thấy tất cả dù app.ctx bị đầu độc).
    expect(
      await db.withUser(randomUUID(), (tx) => count('core.sessions', (q) => tx.execute(q))),
    ).toBe(0);
    await db.system.execute(sql`select set_config('app.ctx', '', false)`);
    await db.system.execute(sql`select set_config('app.user_id', '', false)`);
  });
});
