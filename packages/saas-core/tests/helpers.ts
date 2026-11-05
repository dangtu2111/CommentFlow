import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import { type AuthDb, createAuthDb } from '@flow/db/auth-db';
import pg from 'pg';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

/** Web (cf_app) + `withJob` bằng worker (cf_worker, migration 0030) — như packages/db/tests/helpers.ts. */
export function createTestDb(max = 5): FlowDb {
  const web = createDb({ connectionString: requireEnv('TEST_DATABASE_URL'), max });
  const worker = createDb({ connectionString: requireEnv('TEST_DATABASE_WORKER_URL'), max });
  return {
    ...web,
    withJob: worker.withJob,
    close: async () => {
      await Promise.all([web.close(), worker.close()]);
    },
  };
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

/**
 * CHỈ DÙNG TRONG TEST: thêm thành viên bằng quyền chủ sở hữu DB test (bỏ qua RLS). Trong sản phẩm thành viên chỉ vào
 * qua lời mời (`accept_invitation`) hoặc là Owner đầu tiên của workspace do chính họ tạo (ADR 005); không có API
 * thêm thẳng. Không bao giờ import file này từ `src/` hay `apps/`.
 */
export async function seedMemberForTest(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'staff',
  status: 'active' | 'suspended' | 'removed' = 'active',
): Promise<void> {
  await adminQuery(
    'INSERT INTO core.members (workspace_id, user_id, role, status) VALUES ($1, $2, $3, $4)',
    [workspaceId, userId, role, status],
  );
}
