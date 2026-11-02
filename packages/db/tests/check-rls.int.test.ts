import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkRls } from '../src/check-rls';
import { createAdminPool } from './helpers';

let admin: pg.Pool;
beforeAll(() => {
  admin = createAdminPool();
});
afterAll(async () => {
  await admin.end();
});

/** Chạy một thay đổi cấu trúc TẠM trong giao dịch rồi ROLLBACK để không ảnh hưởng test khác. */
async function violationsAfter(ddl: string) {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(ddl);
    return await checkRls(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('check-rls', () => {
  it('đạt trên schema vừa migrate', async () => {
    expect(await checkRls(admin)).toEqual([]);
  });

  it('bắt được bảng có workspace_id mà tắt RLS', async () => {
    const v = await violationsAfter('ALTER TABLE core.members DISABLE ROW LEVEL SECURITY');
    expect(v).toContainEqual(
      expect.objectContaining({ subject: 'core.members', message: expect.stringContaining('RLS') }),
    );
  });

  it('bắt được bảng bật RLS nhưng xóa hết policy', async () => {
    const v = await violationsAfter('DROP POLICY invitations_isolation ON core.invitations');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.invitations',
        message: expect.stringContaining('policy'),
      }),
    );
  });

  it('bắt được bảng mới không có workspace_id và chưa khai báo là bảng hệ thống', async () => {
    const v = await violationsAfter('CREATE TABLE core.bang_la (id int)');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.bang_la' }));
  });

  it('bắt được bảng mới có workspace_id nhưng quên bật RLS', async () => {
    const v = await violationsAfter('CREATE TABLE cf.quen_rls (id int, workspace_id uuid)');
    expect(v).toContainEqual(
      expect.objectContaining({ subject: 'cf.quen_rls', message: expect.stringContaining('RLS') }),
    );
  });

  it('bắt được quyền cấp cho PUBLIC', async () => {
    const v = await violationsAfter('GRANT SELECT ON core.users TO PUBLIC');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.users',
        message: expect.stringContaining('PUBLIC'),
      }),
    );
  });
});
