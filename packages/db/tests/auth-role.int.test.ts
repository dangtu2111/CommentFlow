import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthDb } from '../src/auth-db';
import { createAuthTestDb, expectRejectCode } from './helpers';

const PERMISSION_DENIED = '42501';

let authDb: AuthDb;
beforeAll(() => {
  authDb = createAuthTestDb(2);
});
afterAll(async () => {
  await authDb.close();
});

/** Mọi bảng nghiệp vụ / hệ thống (không phải bảng xác thực) trong core và cf. */
const BUSINESS_TABLES = [
  'core.workspaces',
  'core.members',
  'core.invitations',
  'core.feature_flags',
  'core.feature_flag_overrides',
  'core.action_logs',
  'cf.ai_usage',
];

describe('role cf_auth không có quyền nào trên bảng nghiệp vụ', () => {
  it.each(BUSINESS_TABLES)(
    'đọc %s bằng pool cf_auth (đã có app.ctx = auth) → từ chối quyền',
    async (table) => {
      expect(
        await expectRejectCode(
          authDb.transaction((tx) => tx.execute(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`))),
        ),
      ).toBe(PERMISSION_DENIED);
      expect(
        await expectRejectCode(authDb.db.execute(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`))),
      ).toBe(PERMISSION_DENIED);
    },
  );

  it('không chèn/sửa/xóa được bảng nghiệp vụ', async () => {
    for (const statement of [
      "INSERT INTO core.workspaces (name, slug) VALUES ('x', 'x-cf-auth')",
      "UPDATE core.members SET role = 'owner'",
      'DELETE FROM core.invitations',
      "INSERT INTO core.feature_flags (key, product, kind) VALUES ('cf_auth.thu', 'commentflow', 'ops')",
    ]) {
      expect(await expectRejectCode(authDb.db.execute(sql.raw(statement))), statement).toBe(
        PERMISSION_DENIED,
      );
    }
  });

  it('không tạo được đối tượng trong schema core/cf/public', async () => {
    for (const schema of ['core', 'cf', 'public']) {
      expect(
        await expectRejectCode(
          authDb.db.execute(sql.raw(`CREATE TABLE ${schema}.cf_auth_thu (id int)`)),
        ),
        schema,
      ).toBe(PERMISSION_DENIED);
    }
  });
});
