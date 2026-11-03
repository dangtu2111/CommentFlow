import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import { users } from '@flow/db/schema/core';

export function createTestDb(max = 5): FlowDb {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Thiếu TEST_DATABASE_URL');
  return createDb({ connectionString: url, max });
}

/** Tạo người dùng qua ngữ cảnh xác thực (bảng users cần ngữ cảnh auth). */
export async function createTestUser(db: FlowDb, name = 'Người dùng thử'): Promise<string> {
  const id = randomUUID();
  await db.auth.insert(users).values({ id, email: `${id}@example.test`, name });
  return id;
}
