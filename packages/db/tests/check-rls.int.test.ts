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
    const v = await violationsAfter(
      [
        'DROP POLICY invitations_select ON core.invitations',
        'DROP POLICY invitations_insert ON core.invitations',
        'DROP POLICY invitations_update ON core.invitations',
      ].join('; '),
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.invitations',
        message: expect.stringContaining('policy'),
      }),
    );
  });

  it('bắt được khi gỡ policy UPDATE của invitations (cf_app còn quyền UPDATE cột revoked_at)', async () => {
    const v = await violationsAfter('DROP POLICY invitations_update ON core.invitations');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.invitations' }));
  });

  it('bắt được khi cf_app lấy lại quyền DELETE hoặc UPDATE rộng trên invitations', async () => {
    const del = await violationsAfter('GRANT DELETE ON core.invitations TO cf_app');
    expect(del).toContainEqual(expect.objectContaining({ subject: 'core.invitations' }));
    const upd = await violationsAfter('GRANT UPDATE (token_hash) ON core.invitations TO cf_app');
    expect(upd).toContainEqual(expect.objectContaining({ subject: 'core.invitations' }));
  });

  it('bắt được hàm SECURITY DEFINER mất search_path cố định hoặc thiếu pg_temp', async () => {
    const noPath = await violationsAfter(
      'ALTER FUNCTION core.accept_invitation(text) RESET search_path',
    );
    expect(noPath).toContainEqual(
      expect.objectContaining({
        subject: 'core.accept_invitation',
        message: expect.stringContaining('search_path'),
      }),
    );
    const noTemp = await violationsAfter(
      'ALTER FUNCTION core.invitation_preview(text) SET search_path = pg_catalog, core',
    );
    expect(noTemp).toContainEqual(
      expect.objectContaining({
        subject: 'core.invitation_preview',
        message: expect.stringContaining('pg_temp'),
      }),
    );
  });

  it('bắt được khi trigger Owner cuối cùng bị tắt hoặc gỡ', async () => {
    for (const ddl of [
      'ALTER TABLE core.members DISABLE TRIGGER members_guard_last_owner',
      'DROP TRIGGER members_guard_last_owner ON core.members',
    ]) {
      const v = await violationsAfter(ddl);
      expect(v).toContainEqual(
        expect.objectContaining({
          subject: 'core.members',
          message: expect.stringContaining('members_guard_last_owner'),
        }),
      );
    }
  });

  it('bắt được khi cf_app lấy lại quyền sửa invited_by của lời mời', async () => {
    const v = await violationsAfter('GRANT UPDATE (invited_by) ON core.invitations TO cf_app');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.invitations' }));
  });

  it('bắt được khi policy chỉ-Owner bị thay bằng policy chỉ theo workspace', async () => {
    const downgrade = (table: string, policy: string, cmd: string, expr: string) =>
      `DROP POLICY ${policy} ON core.${table}; CREATE POLICY ${policy} ON core.${table} FOR ${cmd} ${expr}`;
    for (const [table, ddl] of [
      [
        'members',
        downgrade(
          'members',
          'members_update',
          'UPDATE',
          'USING (workspace_id = (SELECT core.current_workspace_id())) WITH CHECK (workspace_id = (SELECT core.current_workspace_id()))',
        ),
      ],
      [
        'invitations',
        downgrade(
          'invitations',
          'invitations_select',
          'SELECT',
          'USING (workspace_id = (SELECT core.current_workspace_id()))',
        ),
      ],
      [
        'workspaces',
        downgrade(
          'workspaces',
          'workspaces_update',
          'UPDATE',
          'USING (id = (SELECT core.current_workspace_id())) WITH CHECK (id = (SELECT core.current_workspace_id()))',
        ),
      ],
    ] as const) {
      const v = await violationsAfter(ddl);
      expect(v, table).toContainEqual(
        expect.objectContaining({
          subject: `core.${table}`,
          message: expect.stringContaining('người gọi'),
        }),
      );
    }
  });

  it('bắt được policy permissive THỨ HAI (OR mở lại quyền) và policy FOR ALL thiếu kiểm Owner', async () => {
    const extra = await violationsAfter(
      'CREATE POLICY members_update_extra ON core.members FOR UPDATE USING (workspace_id = (SELECT core.current_workspace_id()))',
    );
    expect(extra).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('không có marker'),
      }),
    );
    const all = await violationsAfter(
      'CREATE POLICY invitations_all ON core.invitations FOR ALL USING (workspace_id = (SELECT core.current_workspace_id()))',
    );
    expect(all).toContainEqual(
      expect.objectContaining({
        subject: 'core.invitations',
        message: expect.stringContaining('không có marker'),
      }),
    );
  });

  it('bắt được khi cf_app lấy lại quyền sửa user_id của members', async () => {
    const v = await violationsAfter('GRANT UPDATE (user_id) ON core.members TO cf_app');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.members' }));
  });

  it('bắt được khi members INSERT có thêm nhánh Owner (thêm thẳng) hoặc policy permissive thứ hai', async () => {
    const owner = await violationsAfter(
      "DROP POLICY members_insert ON core.members; CREATE POLICY members_insert ON core.members FOR INSERT WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND ((SELECT core.is_workspace_owner()) OR (role = 'owner' AND user_id = (SELECT core.current_user_id()) AND (SELECT core.workspace_bootstrap_open()))))",
    );
    expect(owner).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('KHÔNG được chứa is_workspace_owner'),
      }),
    );
    const second = await violationsAfter(
      'CREATE POLICY members_insert_extra ON core.members FOR INSERT WITH CHECK (workspace_id = (SELECT core.current_workspace_id()))',
    );
    expect(second).toContainEqual(
      expect.objectContaining({
        subject: 'core.members',
        message: expect.stringContaining('không có marker'),
      }),
    );
  });

  it('bắt được khi cf_app lấy lại quyền sửa status/created_by của workspaces', async () => {
    for (const col of ['status', 'created_by', 'ai_cost_cap_usd']) {
      const v = await violationsAfter(`GRANT UPDATE (${col}) ON core.workspaces TO cf_app`);
      expect(v, col).toContainEqual(expect.objectContaining({ subject: 'core.workspaces' }));
    }
  });

  it('CH-SCHEMA: bắt được khi cf_app lấy lại quyền đọc/ghi token Page hoặc sửa cột khóa gửi / định danh', async () => {
    for (const ddl of [
      'GRANT SELECT (access_token_enc) ON cf.channels TO cf_app',
      'GRANT UPDATE (access_token_enc) ON cf.channels TO cf_app',
      'GRANT UPDATE (send_suspended_until) ON cf.channels TO cf_app',
      'GRANT UPDATE (rate_limit_override) ON cf.channels TO cf_app',
      'GRANT UPDATE (workspace_id) ON cf.comments TO cf_app',
      'GRANT UPDATE (payload) ON cf.webhook_events TO cf_app',
    ]) {
      const v = await violationsAfter(ddl);
      expect(v, ddl).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('cf_app') }),
      );
    }
  });

  it('CH-SCHEMA: bắt được khi policy ghi của channels/webhook_events bị hạ xuống chỉ theo workspace', async () => {
    const ch = await violationsAfter(
      'DROP POLICY channels_update ON cf.channels; CREATE POLICY channels_update ON cf.channels FOR UPDATE USING (workspace_id = (SELECT core.current_workspace_id())) WITH CHECK (workspace_id = (SELECT core.current_workspace_id()))',
    );
    expect(ch).toContainEqual(expect.objectContaining({ subject: 'cf.channels' }));
    const wh = await violationsAfter(
      'DROP POLICY webhook_events_insert ON cf.webhook_events; CREATE POLICY webhook_events_insert ON cf.webhook_events FOR INSERT WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_workspace_member()))',
    );
    expect(wh).toContainEqual(expect.objectContaining({ subject: 'cf.webhook_events' }));
    const sel = await violationsAfter(
      'DROP POLICY comments_select ON cf.comments; CREATE POLICY comments_select ON cf.comments FOR SELECT USING (workspace_id = (SELECT core.current_workspace_id()))',
    );
    expect(sel).toContainEqual(expect.objectContaining({ subject: 'cf.comments' }));
  });

  it('TOKEN-ENC: bắt được khi read_channel_token mở cho Owner (thêm is_workspace_owner) hoặc PUBLIC có EXECUTE', async () => {
    const owner = await violationsAfter(
      'CREATE OR REPLACE FUNCTION cf.read_channel_token(p_channel_id uuid) RETURNS TABLE (ciphertext bytea, key_version integer) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, core, cf, pg_temp AS $$ SELECT access_token_enc, key_version FROM cf.channels WHERE id = p_channel_id AND workspace_id = core.current_workspace_id() AND (core.is_system_context() OR core.is_workspace_owner()) $$',
    );
    expect(owner).toContainEqual(
      expect.objectContaining({
        subject: 'cf.read_channel_token',
        message: expect.stringContaining('chỉ cho đường hệ thống'),
      }),
    );
    const pub = await violationsAfter(
      'GRANT EXECUTE ON FUNCTION cf.clear_channel_token(uuid) TO PUBLIC',
    );
    expect(pub).toContainEqual(
      expect.objectContaining({
        subject: 'cf.clear_channel_token',
        message: expect.stringContaining('PUBLIC'),
      }),
    );
  });

  it('TOKEN-ENC: bắt được khi tắt trigger giới hạn cột, nới thân is_system_context, cấp key_version/INSERT kênh, nới policy comments', async () => {
    const trg = await violationsAfter(
      'ALTER TABLE cf.channels DISABLE TRIGGER channels_guard_user_update',
    );
    expect(trg).toContainEqual(
      expect.objectContaining({
        subject: 'cf.channels',
        message: expect.stringContaining('channels_guard_user_update'),
      }),
    );
    const trg2 = await violationsAfter('DROP TRIGGER comments_guard_user_update ON cf.comments');
    expect(trg2).toContainEqual(
      expect.objectContaining({
        subject: 'cf.comments',
        message: expect.stringContaining('comments_guard_user_update'),
      }),
    );
    const fn = await violationsAfter(
      'CREATE OR REPLACE FUNCTION core.is_system_context() RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, core, pg_temp AS $$ SELECT core.current_user_id() IS NULL $$',
    );
    expect(fn).toContainEqual(expect.objectContaining({ subject: 'core.is_system_context' }));
    const kv = await violationsAfter('GRANT UPDATE (key_version) ON cf.channels TO cf_app');
    expect(kv).toContainEqual(
      expect.objectContaining({
        subject: 'cf.channels',
        message: expect.stringContaining('key_version'),
      }),
    );
    const ins = await violationsAfter(
      'GRANT INSERT (workspace_id, platform, external_id, name) ON cf.channels TO cf_app',
    );
    expect(ins).toContainEqual(
      expect.objectContaining({
        subject: 'cf.channels',
        message: expect.stringContaining('INSERT'),
      }),
    );
    const pol = await violationsAfter(
      'DROP POLICY comments_update ON cf.comments; CREATE POLICY comments_update ON cf.comments FOR UPDATE USING (workspace_id = (SELECT core.current_workspace_id())) WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND ((SELECT core.current_user_id()) IS NULL OR (SELECT core.is_workspace_member())))',
    );
    expect(pol).toContainEqual(expect.objectContaining({ subject: 'cf.comments' }));
  });

  it('WH-INGEST: bắt được khi hàm ghi webhook bỏ kiểm ngữ cảnh trần hoặc PUBLIC có EXECUTE', async () => {
    const open = await violationsAfter(
      'CREATE OR REPLACE FUNCTION cf.record_webhook_event(p_platform text, p_page_external_id text, p_event_hash text, p_payload jsonb) RETURNS TABLE (event_id uuid, event_workspace_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, core, cf, pg_temp AS $$ SELECT NULL::uuid, NULL::uuid WHERE false $$',
    );
    expect(open).toContainEqual(
      expect.objectContaining({
        subject: 'cf.record_webhook_event',
        message: expect.stringContaining('ngữ cảnh trần'),
      }),
    );
    const pub = await violationsAfter(
      'GRANT EXECUTE ON FUNCTION cf.record_webhook_event(text, text, text, jsonb) TO PUBLIC',
    );
    expect(pub).toContainEqual(
      expect.objectContaining({
        subject: 'cf.record_webhook_event',
        message: expect.stringContaining('PUBLIC'),
      }),
    );
  });

  it('CH-SCHEMA: DELETE vẫn bị bắt dù kèm một policy DELETE theo workspace', async () => {
    const v = await violationsAfter(
      'GRANT DELETE ON cf.channels TO cf_app; CREATE POLICY channels_delete ON cf.channels FOR DELETE USING (workspace_id = (SELECT core.current_workspace_id()))',
    );
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'cf.channels',
        message: expect.stringContaining('DELETE'),
      }),
    );
  });

  it('CH-SCHEMA: bắt được khi policy hệ thống bị nới thành "không có người dùng" (withWorkspace trần được nâng quyền)', async () => {
    const v = await violationsAfter(
      'DROP POLICY posts_insert ON cf.posts; CREATE POLICY posts_insert ON cf.posts FOR INSERT WITH CHECK (workspace_id = (SELECT core.current_workspace_id()) AND (SELECT core.is_system_context()) OR (SELECT core.current_user_id()) IS NULL)',
    );
    expect(v).toContainEqual(expect.objectContaining({ subject: 'cf.posts' }));
  });

  it('CH-SCHEMA: bắt được khi cf_app có quyền DELETE trên bảng kênh/bình luận', async () => {
    const v = await violationsAfter('GRANT DELETE ON cf.comments TO cf_app');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'cf.comments' }));
  });

  it('bắt được khi cf_app lấy lại quyền đọc token_hash', async () => {
    const v = await violationsAfter('GRANT SELECT (token_hash) ON core.invitations TO cf_app');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.invitations' }));
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

  it('bắt two_factors mất policy auth (chỉ gỡ policy, không cấp gì cho cf_app)', async () => {
    const v = await violationsAfter('DROP POLICY two_factors_auth_access ON core.two_factors');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.two_factors' }));
  });

  it('bắt two_factors bị tắt RLS', async () => {
    const v = await violationsAfter('ALTER TABLE core.two_factors DISABLE ROW LEVEL SECURITY');
    expect(v).toContainEqual(
      expect.objectContaining({
        subject: 'core.two_factors',
        message: expect.stringContaining('RLS'),
      }),
    );
  });

  it('bắt cf_auth được sửa user_id của two_factors', async () => {
    const v = await violationsAfter('GRANT UPDATE (user_id) ON core.two_factors TO cf_auth');
    expect(v).toContainEqual(expect.objectContaining({ subject: 'core.two_factors' }));
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
