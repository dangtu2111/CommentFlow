import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  disconnectFbSystemConnection,
  getFbSystemConnection,
  markFbSystemConnectionInvalid,
  readFbSystemConnectionToken,
  saveFbSystemConnection,
} from '../src/fb-system-connection';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * CHANNELS-SYSTEM-USER (migration 0086): Owner lưu/ngắt token System User; CHỈ hệ thống đọc ciphertext và đánh dấu hỏng;
 * Staff/người lạ không thấy dòng; web không đọc được cột token; cô lập workspace; mọi lần lưu/ngắt có nhật ký không chứa token.
 */
const RLS = '42501';
const INVALID = '22023';
const NOT_FOUND = 'P0002';

let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
const cipher = () => randomBytes(40);

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'fbsu-owner');
  staff = await seedUser(admin, 'fbsu-staff');
  otherOwner = await seedUser(admin, 'fbsu-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('save / get / quyền', () => {
  it('chưa lưu → null', async () => {
    expect(await app.withActor(ws, owner, (tx) => getFbSystemConnection(tx, ws))).toBeNull();
  });

  it('Owner lưu → connected; đọc lại chỉ thấy trạng thái, không có trường bí mật', async () => {
    await app.withActor(ws, owner, (tx) =>
      saveFbSystemConnection(tx, { ciphertext: cipher(), keyVersion: 1 }),
    );
    const row = await app.withActor(ws, owner, (tx) => getFbSystemConnection(tx, ws));
    expect(row?.status).toBe('connected');
    expect(Object.keys(row ?? {})).not.toContain('ciphertext');
  });

  it('web (cf_app) KHÔNG đọc được cột token trực tiếp', async () => {
    const code = await expectRejectCode(
      app.withActor(ws, owner, (tx) =>
        tx.execute(sql`SELECT token_enc FROM cf.fb_system_connections`),
      ),
    );
    expect(code).toBe(RLS);
  });

  it('Owner (withActor) đọc được ciphertext qua hàm DEFINER; Staff thì KHÔNG (0087)', async () => {
    const token = await app.withActor(ws, owner, (tx) => readFbSystemConnectionToken(tx));
    expect(token?.keyVersion).toBe(1);
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => readFbSystemConnectionToken(tx))),
    ).toBe(RLS);
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => markFbSystemConnectionInvalid(tx))),
    ).toBe(RLS);
  });

  it('Staff và người lạ không thấy dòng; Staff không lưu/ngắt được', async () => {
    expect(await app.withActor(ws, staff, (tx) => getFbSystemConnection(tx, ws))).toBeNull();
    expect(
      await expectRejectCode(
        app.withActor(ws, staff, (tx) =>
          saveFbSystemConnection(tx, { ciphertext: cipher(), keyVersion: 1 }),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => disconnectFbSystemConnection(tx))),
    ).toBe(RLS);
  });

  it('cô lập workspace: workspace khác không thấy kết nối', async () => {
    expect(
      await app.withActor(other, otherOwner, (tx) => getFbSystemConnection(tx, other)),
    ).toBeNull();
  });

  it('ciphertext quá ngắn và key_version không hợp lệ bị từ chối', async () => {
    for (const input of [
      { ciphertext: Buffer.alloc(5), keyVersion: 1 },
      { ciphertext: cipher(), keyVersion: 0 },
    ]) {
      expect(
        await expectRejectCode(app.withActor(ws, owner, (tx) => saveFbSystemConnection(tx, input))),
      ).toBe(INVALID);
    }
  });

  it('lưu lại (dán token mới) giữ MỘT dòng', async () => {
    await app.withActor(ws, owner, (tx) =>
      saveFbSystemConnection(tx, { ciphertext: cipher(), keyVersion: 2 }),
    );
    const rows = await admin.query(
      'SELECT count(*)::int AS n FROM cf.fb_system_connections WHERE workspace_id = $1',
      [ws],
    );
    expect(rows.rows[0].n).toBe(1);
  });
});

describe('đọc ciphertext (chỉ hệ thống) và vòng đời', () => {
  it('hệ thống đọc đúng ciphertext + key_version đã lưu', async () => {
    const data = cipher();
    await app.withActor(ws, owner, (tx) =>
      saveFbSystemConnection(tx, { ciphertext: data, keyVersion: 3 }),
    );
    const token = await worker.withJob(ws, (tx) => readFbSystemConnectionToken(tx));
    expect(token?.keyVersion).toBe(3);
    expect(Buffer.compare(token?.ciphertext ?? Buffer.alloc(0), data)).toBe(0);
  });

  it('workspace khác đọc không ra token của workspace này (cả Owner lẫn hệ thống)', async () => {
    expect(await worker.withJob(other, (tx) => readFbSystemConnectionToken(tx))).toBeNull();
    expect(
      await app.withActor(other, otherOwner, (tx) => readFbSystemConnectionToken(tx)),
    ).toBeNull();
  });

  it('Meta từ chối token → invalid: không còn đọc được ciphertext; dán token mới thì connected lại', async () => {
    await worker.withJob(ws, (tx) => markFbSystemConnectionInvalid(tx));
    expect((await app.withActor(ws, owner, (tx) => getFbSystemConnection(tx, ws)))?.status).toBe(
      'invalid',
    );
    expect(await worker.withJob(ws, (tx) => readFbSystemConnectionToken(tx))).toBeNull();
    await app.withActor(ws, owner, (tx) =>
      saveFbSystemConnection(tx, { ciphertext: cipher(), keyVersion: 1 }),
    );
    expect((await app.withActor(ws, owner, (tx) => getFbSystemConnection(tx, ws)))?.status).toBe(
      'connected',
    );
  });

  it('ngắt → disconnected, ciphertext bị xóa; ngắt khi chưa từng lưu → P0002', async () => {
    await app.withActor(ws, owner, (tx) => disconnectFbSystemConnection(tx));
    expect((await app.withActor(ws, owner, (tx) => getFbSystemConnection(tx, ws)))?.status).toBe(
      'disconnected',
    );
    expect(await worker.withJob(ws, (tx) => readFbSystemConnectionToken(tx))).toBeNull();
    const stored = await admin.query(
      'SELECT token_enc FROM cf.fb_system_connections WHERE workspace_id = $1',
      [ws],
    );
    expect(stored.rows[0].token_enc).toBeNull();
    expect(
      await expectRejectCode(
        app.withActor(other, otherOwner, (tx) => disconnectFbSystemConnection(tx)),
      ),
    ).toBe(NOT_FOUND);
  });

  it('nhật ký ghi lưu/lưu lại/ngắt và KHÔNG chứa token', async () => {
    const logs = await admin.query(
      "SELECT action, after::text AS after FROM core.action_logs WHERE workspace_id = $1 AND target_type = 'fb_system_connection'",
      [ws],
    );
    const actions = logs.rows.map((r) => r.action);
    expect(actions).toContain('fb_system_user.connected');
    expect(actions).toContain('fb_system_user.reconnected');
    expect(actions).toContain('fb_system_user.disconnected');
    for (const row of logs.rows) expect(String(row.after ?? '')).not.toMatch(/ciphertext|token/i);
  });
});
