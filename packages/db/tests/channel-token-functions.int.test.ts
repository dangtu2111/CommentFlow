import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearChannelToken,
  createChannel,
  readChannelToken,
  setChannelToken,
} from '../src/channel-tokens';
import type { Database, FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * TOKEN-ENC (FR-010): bốn hàm DEFINER của token Page. Ghi/tạo/xóa = Owner đang hoạt động hoặc hệ thống (withJob);
 * ĐỌC ciphertext = CHỈ hệ thống. Web (withActor/withWorkspace) không đọc được cột token. Mọi hàm chỉ chạm kênh của
 * workspace hiện tại.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
const ids: Record<string, string> = {};
let channelOther: string;

type Who =
  | 'owner'
  | 'staff'
  | 'suspended'
  | 'removed'
  | 'stranger'
  | 'otherOwner'
  | 'system'
  | 'bare';
const WHO: Who[] = [
  'owner',
  'staff',
  'suspended',
  'removed',
  'stranger',
  'otherOwner',
  'system',
  'bare',
];
const CAN_WRITE: Who[] = ['owner', 'system'];
const CAN_READ: Who[] = ['system'];

const cipher = () => randomBytes(40);

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  for (const name of ['owner', 'staff', 'suspended', 'removed', 'stranger', 'otherOwner']) {
    ids[name] = await seedUser(admin, name);
  }
  await seedMember(admin, ws, ids.owner as string, 'owner');
  await seedMember(admin, ws, ids.staff as string, 'staff');
  await seedMember(admin, ws, ids.suspended as string, 'owner');
  await seedMember(admin, ws, ids.removed as string, 'owner');
  await admin.query("UPDATE core.members SET status = 'suspended' WHERE user_id = $1", [
    ids.suspended,
  ]);
  await admin.query("UPDATE core.members SET status = 'removed' WHERE user_id = $1", [ids.removed]);
  await seedMember(admin, other, ids.otherOwner as string, 'owner');
  const row = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page B') RETURNING id",
    [other, `p-${newId()}`],
  );
  channelOther = row.rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

type Outcome<T> = { ok: true; value: T } | { ok: false; code: string };

/** Chạy `fn` với người gọi `who` ở workspace `workspaceId`; lỗi Postgres → trả mã SQLSTATE. */
async function as<T>(
  who: Who,
  fn: (tx: Database) => Promise<T>,
  workspaceId = ws,
): Promise<Outcome<T>> {
  try {
    const value =
      who === 'system'
        ? await db.withJob(workspaceId, fn)
        : who === 'bare'
          ? await db.withWorkspace(workspaceId, fn)
          : await db.withActor(workspaceId, ids[who] as string, fn);
    return { ok: true, value };
  } catch (error) {
    const e = error as { cause?: { code?: string }; code?: string };
    return { ok: false, code: e.cause?.code ?? e.code ?? 'unknown' };
  }
}

const newChannel = (suffix: string) => ({
  platform: 'facebook' as const,
  externalId: `page-${suffix}-${newId()}`,
  name: 'Fanpage thử',
  scopes: ['pages_show_list'],
});

async function seedChannel(): Promise<string> {
  const result = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [ws, `p-${newId()}`],
  );
  return result.rows[0].id;
}

describe('FR-010 hàm DEFINER token Page — ma trận người gọi × hàm', () => {
  it('create_channel / set_channel_token / clear_channel_token: chỉ Owner đang hoạt động hoặc hệ thống', async () => {
    for (const who of WHO) {
      const create = await as(who, (tx) => createChannel(tx, newChannel(who)));
      expect(create.ok, `create ${who}`).toBe(CAN_WRITE.includes(who));
      if (!create.ok) expect(create.code, `create ${who}`).toBe('42501');

      const channelId = await seedChannel();
      const set = await as(who, (tx) =>
        setChannelToken(tx, { channelId, ciphertext: cipher(), keyVersion: 1 }),
      );
      expect(set.ok, `set ${who}`).toBe(CAN_WRITE.includes(who));
      if (!set.ok) expect(set.code, `set ${who}`).toBe('42501');

      const clear = await as(who, (tx) => clearChannelToken(tx, channelId));
      expect(clear.ok, `clear ${who}`).toBe(CAN_WRITE.includes(who));
      if (!clear.ok) expect(clear.code, `clear ${who}`).toBe('42501');
    }
  });

  it('read_channel_token: CHỈ hệ thống (withJob); Owner/Staff/withWorkspace trần đều bị từ chối', async () => {
    const channelId = await seedChannel();
    const stored = cipher();
    await admin.query(
      'UPDATE cf.channels SET access_token_enc = $2, key_version = 3 WHERE id = $1',
      [channelId, stored],
    );
    for (const who of WHO) {
      const result = await as(who, (tx) => readChannelToken(tx, channelId));
      expect(result.ok, `read ${who}`).toBe(CAN_READ.includes(who));
      if (!result.ok) expect(result.code, `read ${who}`).toBe('42501');
      if (result.ok) {
        expect(result.value?.ciphertext.equals(stored)).toBe(true);
        expect(result.value?.keyVersion).toBe(3);
      }
    }
  });

  it('cột access_token_enc / key_version KHÔNG đọc được trực tiếp bằng bất kỳ đường nào của cf_app', async () => {
    const channelId = await seedChannel();
    for (const who of WHO) {
      for (const column of ['access_token_enc', 'key_version']) {
        const result = await as(who, (tx) =>
          tx.execute(sql.raw(`SELECT ${column} FROM cf.channels WHERE id = '${channelId}'`)),
        );
        expect(result.ok, `${who} đọc ${column}`).toBe(false);
        if (!result.ok) expect(result.code).toBe('42501');
      }
      const write = await as(who, (tx) =>
        tx.execute(
          sql.raw(`UPDATE cf.channels SET access_token_enc = '\\x00' WHERE id = '${channelId}'`),
        ),
      );
      expect(write.ok, `${who} ghi trực tiếp token`).toBe(false);
    }
  });
});

describe('FR-010 cô lập workspace và hành vi từng hàm', () => {
  it('id kênh của workspace khác: set/clear → không tìm thấy (P0002), read → không có dòng; token kênh kia không đổi', async () => {
    await admin.query('UPDATE cf.channels SET access_token_enc = $2 WHERE id = $1', [
      channelOther,
      Buffer.alloc(40, 9),
    ]);
    for (const who of CAN_WRITE) {
      const set = await as(who, (tx) =>
        setChannelToken(tx, { channelId: channelOther, ciphertext: cipher(), keyVersion: 1 }),
      );
      expect(set, `set ${who}`).toEqual({ ok: false, code: 'P0002' });
      const clear = await as(who, (tx) => clearChannelToken(tx, channelOther));
      expect(clear, `clear ${who}`).toEqual({ ok: false, code: 'P0002' });
    }
    const read = await as('system', (tx) => readChannelToken(tx, channelOther));
    expect(read).toEqual({ ok: true, value: null });
    const row = (
      await admin.query('SELECT access_token_enc, status FROM cf.channels WHERE id = $1', [
        channelOther,
      ])
    ).rows[0];
    expect(Buffer.from(row.access_token_enc).equals(Buffer.alloc(40, 9))).toBe(true);
    expect(row.status).toBe('connected');
  });

  it('owner của workspace KHÁC (không phải thành viên ws) không tạo/ghi được trong ws', async () => {
    const create = await as('otherOwner', (tx) => createChannel(tx, newChannel('x')));
    expect(create).toEqual({ ok: false, code: '42501' });
  });

  it('create_channel upsert: kết nối lại cùng Page trả CÙNG channel_id, đặt connected, giữ token cũ, ghi action_logs', async () => {
    const input = newChannel('upsert');
    const first = await as('owner', (tx) => createChannel(tx, input));
    expect(first.ok).toBe(true);
    const id = (first as { value: string }).value;
    await as('system', (tx) =>
      setChannelToken(tx, { channelId: id, ciphertext: Buffer.alloc(40, 5), keyVersion: 2 }),
    );
    await admin.query("UPDATE cf.channels SET status = 'expired' WHERE id = $1", [id]);

    const again = await as('owner', (tx) => createChannel(tx, { ...input, name: 'Tên mới' }));
    expect(again).toEqual({ ok: true, value: id });
    const row = (
      await admin.query(
        'SELECT name, status, access_token_enc, key_version FROM cf.channels WHERE id = $1',
        [id],
      )
    ).rows[0];
    expect(row.name).toBe('Tên mới');
    expect(row.status).toBe('connected');
    expect(Buffer.from(row.access_token_enc).equals(Buffer.alloc(40, 5))).toBe(true);
    expect(row.key_version).toBe(2);

    const logs = (
      await admin.query(
        'SELECT action, actor_type, actor_id, after FROM core.action_logs WHERE workspace_id = $1 AND target_id = $2 ORDER BY created_at',
        [ws, id],
      )
    ).rows;
    expect(logs.map((l) => l.action)).toEqual([
      'channel.connected',
      'channel.token_set',
      'channel.reconnected',
    ]);
    expect(logs.map((l) => l.actor_type)).toEqual(['user', 'system', 'user']);
    expect(logs[0]?.actor_id).toBe(ids.owner);
    expect(logs[1]?.actor_id).toBeNull();
    expect(JSON.stringify(logs)).not.toContain('access_token');
  });

  it('create_channel đường hệ thống ghi action_logs actor_type=system (không actor_id); platform sai bị CHECK từ chối', async () => {
    const id = (await as('system', (tx) => createChannel(tx, newChannel('sys')))) as {
      ok: true;
      value: string;
    };
    const log = (
      await admin.query('SELECT actor_type, actor_id FROM core.action_logs WHERE target_id = $1', [
        id.value,
      ])
    ).rows[0];
    expect(log).toEqual({ actor_type: 'system', actor_id: null });
    const bad = await as('owner', (tx) =>
      createChannel(tx, { ...newChannel('bad'), platform: 'zalo' as never }),
    );
    expect(bad).toEqual({ ok: false, code: '23514' });
  });

  it('set_channel_token: ghi ciphertext, key_version, hạn token; payload sai (ngắn/NULL/key_version<1) → 22023, không đổi gì', async () => {
    const channelId = await seedChannel();
    const stored = cipher();
    const expires = new Date(Date.now() + 3600_000);
    expect(
      await as('owner', (tx) =>
        setChannelToken(tx, { channelId, ciphertext: stored, keyVersion: 4, expiresAt: expires }),
      ),
    ).toEqual({ ok: true, value: undefined });
    const row = (
      await admin.query(
        'SELECT access_token_enc, key_version, token_expires_at FROM cf.channels WHERE id = $1',
        [channelId],
      )
    ).rows[0];
    expect(Buffer.from(row.access_token_enc).equals(stored)).toBe(true);
    expect(row.key_version).toBe(4);
    expect(new Date(row.token_expires_at).getTime()).toBe(expires.getTime());

    for (const bad of [
      { ciphertext: Buffer.alloc(10), keyVersion: 1 },
      { ciphertext: cipher(), keyVersion: 0 },
    ]) {
      expect(await as('system', (tx) => setChannelToken(tx, { channelId, ...bad }))).toEqual({
        ok: false,
        code: '22023',
      });
    }
    const nulled = await as('system', (tx) =>
      tx.execute(
        sql`SELECT cf.set_channel_token(${channelId}::uuid, NULL::bytea, 1, NULL::timestamptz)`,
      ),
    );
    expect(nulled).toEqual({ ok: false, code: '22023' });
    const after = (
      await admin.query('SELECT access_token_enc, key_version FROM cf.channels WHERE id = $1', [
        channelId,
      ])
    ).rows[0];
    expect(Buffer.from(after.access_token_enc).equals(stored)).toBe(true);
    expect(after.key_version).toBe(4);
  });

  it('clear_channel_token: token NULL, hạn NULL, status revoked, webhook_subscribed=false; đọc lại → không có dòng; ghi action_logs', async () => {
    const channelId = await seedChannel();
    await as('owner', (tx) =>
      setChannelToken(tx, {
        channelId,
        ciphertext: cipher(),
        keyVersion: 1,
        expiresAt: new Date(Date.now() + 1000),
      }),
    );
    await admin.query('UPDATE cf.channels SET webhook_subscribed = true WHERE id = $1', [
      channelId,
    ]);
    expect(await as('owner', (tx) => clearChannelToken(tx, channelId))).toEqual({
      ok: true,
      value: undefined,
    });
    const row = (
      await admin.query(
        'SELECT access_token_enc, token_expires_at, status, webhook_subscribed FROM cf.channels WHERE id = $1',
        [channelId],
      )
    ).rows[0];
    expect(row).toEqual({
      access_token_enc: null,
      token_expires_at: null,
      status: 'revoked',
      webhook_subscribed: false,
    });
    expect(await as('system', (tx) => readChannelToken(tx, channelId))).toEqual({
      ok: true,
      value: null,
    });
    const log = (
      await admin.query(
        "SELECT action FROM core.action_logs WHERE target_id = $1 AND action = 'channel.token_cleared'",
        [channelId],
      )
    ).rowCount;
    expect(log).toBe(1);
  });

  it('hàm không chạy được khi không có workspace trong ngữ cảnh (withUser/không ngữ cảnh) và PUBLIC không có quyền EXECUTE', async () => {
    const perms = (
      await admin.query(
        `SELECT p.proname, p.prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
                has_function_privilege('cf_app', p.oid, 'EXECUTE') AS app_exec,
                p.proconfig::text AS config
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'cf' AND p.proname IN ('create_channel','set_channel_token','clear_channel_token','read_channel_token')
          ORDER BY p.proname`,
      )
    ).rows;
    expect(perms.map((p) => p.proname)).toEqual([
      'clear_channel_token',
      'create_channel',
      'read_channel_token',
      'set_channel_token',
    ]);
    for (const p of perms) {
      expect(p.prosecdef, p.proname).toBe(true);
      expect(p.public_exec, p.proname).toBe(false);
      // 0030: read_channel_token chỉ cf_worker; ba hàm ghi token vẫn cho cf_app (Owner ghi ở callback OAuth, web).
      expect(p.app_exec, p.proname).toBe(p.proname !== 'read_channel_token');
      expect(p.config, p.proname).toContain('search_path=pg_catalog, core, cf, pg_temp');
    }
    const noWs = await db
      .withSystem((tx) =>
        tx.execute(sql`SELECT cf.create_channel('facebook', 'x', 'x', NULL, ARRAY[]::text[])`),
      )
      .then(
        () => 'ok',
        (e: { cause?: { code?: string }; code?: string }) => e.cause?.code ?? e.code,
      );
    expect(noWs).toBe('42501');
  });
});

describe('FR-010 cf.channel_key_versions (kiểm khóa lúc khởi động)', () => {
  it('trả các key_version đang có token (chỉ số nguyên, xuyên workspace); PUBLIC không có quyền; cf_app gọi được không cần ngữ cảnh', async () => {
    const channelId = await seedChannel();
    await admin.query(
      'UPDATE cf.channels SET access_token_enc = $2, key_version = 41 WHERE id = $1',
      [channelId, cipher()],
    );
    const versions = await db.withSystem((tx) =>
      tx.execute<{ v: number }>(sql`SELECT cf.channel_key_versions() AS v`),
    );
    expect(versions.rows.map((r) => Number(r.v))).toContain(41);
    const perm = (
      await admin.query(
        "SELECT has_function_privilege('public', 'cf.channel_key_versions()', 'EXECUTE') AS pub, has_function_privilege('cf_app', 'cf.channel_key_versions()', 'EXECUTE') AS app",
      )
    ).rows[0];
    expect(perm).toEqual({ pub: false, app: true });
    await admin.query(
      'UPDATE cf.channels SET access_token_enc = NULL, key_version = 1 WHERE id = $1',
      [channelId],
    );
  });
});
