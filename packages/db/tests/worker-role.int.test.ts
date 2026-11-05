import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readChannelToken } from '../src/channel-tokens';
import type { Database, FlowDb } from '../src/client';
import {
  createAdminPool,
  createWebDb,
  createWorkerDb,
  expectRejectCode,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * WORKER-DB-ROLE (ADR 011, migration 0030): chỉ kết nối bằng role `cf_worker` mới là "hệ thống" và mới gọi được
 * `cf.read_channel_token`. Web (`cf_app`) tự đặt `app.ctx = 'system'` cũng KHÔNG thành hệ thống và không đọc được ciphertext.
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let ws: string;
let owner: string;
let channelId: string;
const stored = randomBytes(40);

const isSystem = async (tx: Database): Promise<boolean> => {
  await tx.execute(sql`select set_config('app.ctx', 'system', true)`);
  const result = await tx.execute(sql`select core.is_system_context() as ok`);
  return (result.rows[0] as { ok: boolean }).ok;
};

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb(2);
  worker = createWorkerDb(2);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'chủ shop');
  await seedMember(admin, ws, owner, 'owner');
  const row = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name, access_token_enc, key_version) VALUES ($1, 'facebook', $2, 'Page', $3, 2) RETURNING id",
    [ws, `p-${newId()}`, stored],
  );
  channelId = row.rows[0].id;
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close()]);
  await admin.end();
});

describe('WORKER-DB-ROLE — cf_app (web) không thành hệ thống, không đọc được token', () => {
  it('withJob qua cf_app (web) KHÔNG phải hệ thống, dù app.ctx = system', async () => {
    expect(await web.withJob(ws, isSystem)).toBe(false);
    expect(await web.withWorkspace(ws, isSystem)).toBe(false);
  });

  it('cf_app tự đặt app.ctx = system rồi gọi read_channel_token → 42501 (không có EXECUTE)', async () => {
    for (const run of [
      (fn: (tx: Database) => Promise<unknown>) => web.withJob(ws, fn),
      (fn: (tx: Database) => Promise<unknown>) => web.withWorkspace(ws, fn),
      (fn: (tx: Database) => Promise<unknown>) => web.withActor(ws, owner, fn),
    ]) {
      const code = await expectRejectCode(
        run(async (tx) => {
          await tx.execute(sql`select set_config('app.ctx', 'system', true)`);
          return readChannelToken(tx, channelId);
        }),
      );
      expect(code).toBe('42501');
    }
  });

  it('cf_app không ghi được bảng đòi hệ thống (posts INSERT) dù tự đặt app.ctx = system', async () => {
    const code = await expectRejectCode(
      web.withJob(ws, (tx) =>
        tx.execute(
          sql`INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES (${ws}::uuid, ${channelId}::uuid, ${`post-${newId()}`})`,
        ),
      ),
    );
    expect(code).toBe('42501');
  });

  it('cf_app không SET ROLE sang cf_worker hay cf_owner (không là thành viên)', async () => {
    for (const role of ['cf_worker', 'cf_owner']) {
      const code = await expectRejectCode(
        web.withSystem((tx) => tx.execute(sql.raw(`SET LOCAL ROLE ${role}`))),
      );
      expect(code, role).toBe('42501');
    }
  });
});

describe('WORKER-DB-ROLE — cf_worker là đường hệ thống duy nhất', () => {
  it('withJob qua cf_worker là hệ thống và đọc được ciphertext', async () => {
    expect(await worker.withJob(ws, isSystem)).toBe(true);
    const read = await worker.withJob(ws, (tx) => readChannelToken(tx, channelId));
    expect(read?.ciphertext.equals(stored)).toBe(true);
    expect(read?.keyVersion).toBe(2);
  });

  it('cf_worker ghi được bảng hệ thống (posts INSERT) trong workspace của job', async () => {
    await worker.withJob(ws, (tx) =>
      tx.execute(
        sql`INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES (${ws}::uuid, ${channelId}::uuid, ${`post-${newId()}`})`,
      ),
    );
  });

  it('cf_worker không có ngữ cảnh hệ thống khi withWorkspace trần hoặc khi có người dùng (withActor)', async () => {
    // Không tự đặt app.ctx = system: withWorkspace trần không phải hệ thống dù kết nối là cf_worker.
    const plain = async (tx: Database): Promise<boolean> =>
      ((await tx.execute(sql`select core.is_system_context() as ok`)).rows[0] as { ok: boolean }).ok;
    expect(await worker.withWorkspace(ws, plain)).toBe(false);
    // Có người dùng trong ngữ cảnh thì app.ctx = system cũng không làm thành hệ thống.
    expect(await worker.withActor(ws, owner, isSystem)).toBe(false);
    expect(
      await expectRejectCode(worker.withWorkspace(ws, (tx) => readChannelToken(tx, channelId))),
    ).toBe('42501');
  });

  it('cf_worker không SET ROLE sang cf_owner', async () => {
    const code = await expectRejectCode(
      worker.withSystem((tx) => tx.execute(sql`SET LOCAL ROLE cf_owner`)),
    );
    expect(code).toBe('42501');
  });
});

describe('WORKER-DB-ROLE — thuộc tính role và quyền hàm (catalog)', () => {
  it('cf_worker: LOGIN, không SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB; là thành viên cf_app; cf_app không thuộc cf_worker', async () => {
    const role = await admin.query(
      `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
              pg_has_role('cf_worker', 'cf_app', 'member') AS worker_in_app,
              pg_has_role('cf_app', 'cf_worker', 'member') AS app_in_worker
         FROM pg_roles WHERE rolname = 'cf_worker'`,
    );
    expect(role.rows[0]).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      worker_in_app: true,
      app_in_worker: false,
    });
  });

  it('EXECUTE read_channel_token: cf_worker có; cf_app và PUBLIC không', async () => {
    const result = await admin.query(
      `SELECT has_function_privilege('cf_worker', 'cf.read_channel_token(uuid)', 'execute') AS worker,
              has_function_privilege('cf_app', 'cf.read_channel_token(uuid)', 'execute') AS app,
              has_function_privilege('public', 'cf.read_channel_token(uuid)', 'execute') AS pub`,
    );
    expect(result.rows[0]).toEqual({ worker: true, app: false, pub: false });
  });

  it('thân core.is_system_context() kiểm role đăng nhập (session_user)', async () => {
    const result = await admin.query(
      "SELECT pg_get_functiondef('core.is_system_context()'::regprocedure) AS def",
    );
    expect(result.rows[0].def).toContain('session_user');
    expect(result.rows[0].def).toContain('cf_worker');
  });
});
