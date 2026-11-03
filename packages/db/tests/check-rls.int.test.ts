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

  it('bắt policy USING (true): có policy nhưng không dựa vào current_workspace_id()', async () => {
    const v = await violationsAfter(`
      CREATE TABLE cf.policy_long_leo (id int, workspace_id uuid);
      ALTER TABLE cf.policy_long_leo ENABLE ROW LEVEL SECURITY;
      CREATE POLICY mo_het ON cf.policy_long_leo USING (true);
      GRANT SELECT ON cf.policy_long_leo TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.policy_long_leo',
        message: expect.stringContaining('quyền SELECT nhưng không có policy SELECT'),
      }),
    );
  });

  it('bắt cf_app có quyền UPDATE nhưng bảng chỉ có policy SELECT (lỗi im lặng)', async () => {
    const v = await violationsAfter(`
      CREATE TABLE cf.thieu_policy_update (id int, workspace_id uuid);
      ALTER TABLE cf.thieu_policy_update ENABLE ROW LEVEL SECURITY;
      CREATE POLICY chi_doc ON cf.thieu_policy_update FOR SELECT
        USING (workspace_id = (SELECT core.current_workspace_id()));
      GRANT SELECT, UPDATE ON cf.thieu_policy_update TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.thieu_policy_update',
        message: expect.stringContaining('quyền UPDATE nhưng không có policy UPDATE'),
      }),
    );
  });

  it('bắt cf_app được cấp CREATE trên schema', async () => {
    const v = await violationsAfter('GRANT CREATE ON SCHEMA core TO cf_app');
    expect(v).toContainEqual(
      expect.objectContaining({ subject: 'cf_app', message: 'có quyền CREATE trên schema core' }),
    );
  });

  it('bắt view trong core/cf', async () => {
    const v = await violationsAfter('CREATE VIEW core.v_lo_du_lieu AS SELECT id FROM core.users');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.v_lo_du_lieu' }));
  });

  it('bắt một policy mở toang đi kèm một policy đúng (permissive cộng dồn bằng OR)', async () => {
    const v = await violationsAfter(`
      CREATE TABLE cf.hai_policy (id int, workspace_id uuid);
      ALTER TABLE cf.hai_policy ENABLE ROW LEVEL SECURITY;
      CREATE POLICY dung ON cf.hai_policy FOR SELECT
        USING (workspace_id = (SELECT core.current_workspace_id()));
      CREATE POLICY mo_het ON cf.hai_policy FOR SELECT USING (true);
      GRANT SELECT ON cf.hai_policy TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.hai_policy',
        message: expect.stringContaining('policy "mo_het" mở quá rộng'),
      }),
    );
  });

  it('bắt UPDATE có USING đúng nhưng WITH CHECK (true) (chuyển dữ liệu sang workspace khác)', async () => {
    const v = await violationsAfter(`
      CREATE TABLE cf.check_ho (id int, workspace_id uuid);
      ALTER TABLE cf.check_ho ENABLE ROW LEVEL SECURITY;
      CREATE POLICY doc ON cf.check_ho FOR SELECT
        USING (workspace_id = (SELECT core.current_workspace_id()));
      CREATE POLICY sua ON cf.check_ho FOR UPDATE
        USING (workspace_id = (SELECT core.current_workspace_id())) WITH CHECK (true);
      GRANT SELECT, UPDATE ON cf.check_ho TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.check_ho',
        message: expect.stringContaining('quyền UPDATE nhưng không có policy UPDATE'),
      }),
    );
  });

  it('bắt quyền cấp THEO CỘT (GRANT UPDATE (cột)) khi bảng thiếu policy UPDATE', async () => {
    const v = await violationsAfter(`
      CREATE TABLE cf.quyen_cot (id int, workspace_id uuid, ghi_chu text);
      ALTER TABLE cf.quyen_cot ENABLE ROW LEVEL SECURITY;
      CREATE POLICY doc ON cf.quyen_cot FOR SELECT
        USING (workspace_id = (SELECT core.current_workspace_id()));
      GRANT SELECT ON cf.quyen_cot TO cf_app;
      GRANT UPDATE (ghi_chu) ON cf.quyen_cot TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.quyen_cot',
        message: expect.stringContaining('quyền UPDATE nhưng không có policy UPDATE'),
      }),
    );
  });

  it('policy chỉ áp cho vai trò khác (TO cf_owner) không được tính là phủ cf_app', async () => {
    const v = await violationsAfter(`
      CREATE TABLE cf.chi_cho_owner (id int, workspace_id uuid);
      ALTER TABLE cf.chi_cho_owner ENABLE ROW LEVEL SECURITY;
      CREATE POLICY rieng ON cf.chi_cho_owner FOR SELECT TO cf_owner
        USING (workspace_id = (SELECT core.current_workspace_id()));
      GRANT SELECT ON cf.chi_cho_owner TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.chi_cho_owner',
        message: expect.stringContaining('không có policy nào áp cho cf_app'),
      }),
    );
  });

  it('bắt bảng xác thực (two_factors) có policy nhưng không dựa vào ngữ cảnh auth', async () => {
    const v = await violationsAfter(`
      DROP POLICY two_factors_auth_access ON core.two_factors;
      CREATE POLICY tuy_tien ON core.two_factors FOR SELECT
        USING (user_id = (SELECT core.current_user_id()));
      GRANT SELECT ON core.two_factors TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.two_factors',
        message: expect.stringContaining('không được có quyền nào'),
      }),
    );
  });

  it('bắt bảng xác thực bị tắt RLS (sessions)', async () => {
    const v = await violationsAfter('ALTER TABLE core.sessions DISABLE ROW LEVEL SECURITY');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.sessions',
        message: expect.stringContaining('RLS'),
      }),
    );
  });

  it('bắt cf_app được cấp quyền ghi trên bảng hệ thống feature_flags', async () => {
    const v = await violationsAfter('GRANT INSERT ON core.feature_flags TO cf_app');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.feature_flags',
        message: expect.stringContaining('chỉ cho cf_app quyền SELECT'),
      }),
    );
  });

  it('bắt cf_app được cấp TRUNCATE', async () => {
    const v = await violationsAfter('GRANT TRUNCATE ON core.members TO cf_app');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('TRUNCATE'),
      }),
    );
  });

  it('bắt hàm mới trong core còn EXECUTE cho PUBLIC (quên REVOKE)', async () => {
    const v = await violationsAfter(
      'CREATE FUNCTION core.ham_cong_khai() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.ham_cong_khai',
        message: expect.stringContaining('EXECUTE'),
      }),
    );
  });

  it('bắt policy của bảng "của mình" (sessions) mở toang kiểu OR 1 = 1', async () => {
    const v = await violationsAfter(`
      CREATE POLICY mo_toang ON core.sessions USING (true);
      `);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.sessions',
        message: expect.stringContaining('mo_toang'),
      }),
    );
  });

  it('bắt cf_auth được cấp quyền trên bảng nghiệp vụ', async () => {
    const v = await violationsAfter('GRANT SELECT ON core.members TO cf_auth');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('chỉ được truy cập bảng xác thực'),
      }),
    );
  });

  it('bắt policy của cf_auth trên bảng xác thực bị gỡ (quyền còn, policy mất)', async () => {
    const v = await violationsAfter('DROP POLICY sessions_auth_access ON core.sessions');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.sessions',
        message: expect.stringContaining('cf_auth có quyền'),
      }),
    );
  });

  it('bắt policy của cf_auth mở toang (không đòi app.ctx)', async () => {
    const v = await violationsAfter(
      'CREATE POLICY mo_cho_auth ON core.sessions FOR SELECT TO cf_auth USING (true)',
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.sessions',
        message: expect.stringContaining('cf_auth có quyền SELECT'),
      }),
    );
  });

  it('bắt cf_app được cấp quyền trên verifications (chỉ cf_auth được)', async () => {
    const v = await violationsAfter('GRANT SELECT ON core.verifications TO cf_app');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.verifications',
        message: expect.stringContaining('không được có quyền nào'),
      }),
    );
  });

  it('bắt policy của cf_app trên sessions dựa vào app.ctx (cf_app tự vào ngữ cảnh auth)', async () => {
    const v = await violationsAfter(
      'CREATE POLICY qua_ctx ON core.sessions FOR SELECT TO cf_app USING ((SELECT core.in_auth_context()))',
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.sessions',
        message: expect.stringContaining('qua_ctx'),
      }),
    );
  });

  it('bắt cf_app được cấp lại SELECT cả bảng sessions (lộ cột token)', async () => {
    const v = await violationsAfter('GRANT SELECT ON core.sessions TO cf_app');
    expect(v).toContainEqual({
      subject: 'core.sessions',
      message: 'cf_app không được có quyền SELECT trên cột token',
    });
  });

  it('bắt cf_auth được cấp UPDATE cột users.is_admin', async () => {
    const v = await violationsAfter('GRANT UPDATE (is_admin) ON core.users TO cf_auth');
    expect(v).toContainEqual({
      subject: 'core.users',
      message: 'cf_auth không được có quyền UPDATE trên cột is_admin',
    });
  });

  it('bắt cf_app được cấp lại SELECT cả bảng users (lộ is_admin, email_verified...)', async () => {
    const v = await violationsAfter('GRANT SELECT ON core.users TO cf_app');
    for (const column of ['is_admin', 'admin_role', 'email_verified', 'totp_enabled']) {
      expect(v).toContainEqual({
        subject: 'core.users',
        message: `cf_app không được có quyền SELECT trên cột ${column}`,
      });
    }
  });

  it('bắt cột mới của users bị lộ cho cf_app khi ai đó cấp lại SELECT cả bảng (danh sách cho phép 7 cột)', async () => {
    const v = await violationsAfter(`
      ALTER TABLE core.users ADD COLUMN phone text;
      GRANT SELECT ON core.users TO cf_app`);
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.users',
        message: expect.stringContaining('cột phone'),
      }),
    );
  });

  it('bắt khi policy RESTRICTIVE chặn cf_auth tạo Admin bị gỡ', async () => {
    const v = await violationsAfter('DROP POLICY users_auth_no_admin_insert ON core.users');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.users',
        message: expect.stringContaining('thiếu policy RESTRICTIVE'),
      }),
    );
  });
});
