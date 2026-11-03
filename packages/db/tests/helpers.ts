import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { type AuthDb, createAuthDb } from '../src/auth-db';
import { createDb, type FlowDb } from '../src/client';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

/** Kết nối bằng role chủ sở hữu (cf_owner): dùng để gieo dữ liệu, KHÔNG phải đường truy cập của ứng dụng. */
export function createAdminPool(): pg.Pool {
  return new pg.Pool({ connectionString: requireEnv('TEST_DATABASE_ADMIN_URL'), max: 2 });
}

/** Kết nối bằng role ứng dụng (cf_app) — chịu RLS như production. */
export function createAppDb(max = 5): FlowDb {
  return createDb({ connectionString: requireEnv('TEST_DATABASE_URL'), max });
}

/** Pool role cf_auth (adapter Better Auth) với app.ctx = 'auth' — chỉ chạm bảng xác thực. */
export function createAuthTestDb(max = 5): AuthDb {
  return createAuthDb({ connectionString: requireEnv('TEST_DATABASE_AUTH_URL'), max });
}

/** Pool role cf_auth KHÔNG có app.ctx: chứng minh cần cả role lẫn ngữ cảnh. */
export function createContextlessAuthPool(): pg.Pool {
  return new pg.Pool({ connectionString: requireEnv('TEST_DATABASE_AUTH_URL'), max: 1 });
}

export const newId = (): string => randomUUID();

export async function seedUser(admin: pg.Pool, name = 'Người dùng thử'): Promise<string> {
  const id = newId();
  await admin.query('INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3)', [
    id,
    `${id}@example.test`,
    name,
  ]);
  return id;
}

export async function seedWorkspace(admin: pg.Pool): Promise<string> {
  const id = newId();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    id,
    `Shop ${id.slice(0, 4)}`,
    `shop-${id}`,
  ]);
  return id;
}

export async function seedMember(
  admin: pg.Pool,
  workspaceId: string,
  userId: string,
  role: 'owner' | 'staff' = 'staff',
): Promise<string> {
  const id = newId();
  await admin.query(
    'INSERT INTO core.members (id, workspace_id, user_id, role) VALUES ($1, $2, $3, $4)',
    [id, workspaceId, userId, role],
  );
  return id;
}

export async function seedAiUsage(
  admin: pg.Pool,
  workspaceId: string,
  step = 'classify',
): Promise<string> {
  const id = newId();
  await admin.query(
    'INSERT INTO cf.ai_usage (id, workspace_id, step, model) VALUES ($1, $2, $3, $4)',
    [id, workspaceId, step, 'mock-llm'],
  );
  return id;
}

/** Mã lỗi Postgres (Drizzle bọc lỗi gốc trong `cause`). */
export function pgCodeOf(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export async function expectRejectCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return pgCodeOf(error) ?? 'KHÔNG-CÓ-MÃ';
  }
  return undefined;
}
