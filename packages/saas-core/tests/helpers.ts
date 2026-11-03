import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import { type AuthDb, createAuthDb } from '@flow/db/auth-db';
import pg from 'pg';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

/** Kết nối bằng role ứng dụng cf_app — chịu RLS như production. */
export function createTestDb(max = 5): FlowDb {
  return createDb({ connectionString: requireEnv('TEST_DATABASE_URL'), max });
}

/** Pool role cf_auth (adapter Better Auth) — chỉ chạm bảng xác thực. */
export function createTestAuthDb(max = 5): AuthDb {
  return createAuthDb({ connectionString: requireEnv('TEST_DATABASE_AUTH_URL'), max });
}

/** Tạo người dùng bằng quyền chủ sở hữu (cf_app không còn quyền chèn users). */
export async function createTestUser(
  name = 'Người dùng thử',
  options: { email?: string; verified?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const client = new pg.Client({ connectionString: requireEnv('TEST_DATABASE_ADMIN_URL') });
  await client.connect();
  try {
    await client.query(
      'INSERT INTO core.users (id, email, name, email_verified) VALUES ($1, $2, $3, $4)',
      [id, options.email ?? `${id}@example.test`, name, options.verified ?? false],
    );
  } finally {
    await client.end();
  }
  return id;
}

/** Chạy một câu SQL bằng quyền chủ sở hữu (gieo/đổi dữ liệu thử, ví dụ làm hết hạn lời mời). */
export async function adminQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: requireEnv('TEST_DATABASE_ADMIN_URL') });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}
