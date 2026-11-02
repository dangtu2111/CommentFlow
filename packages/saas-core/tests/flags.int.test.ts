import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFlags, type Flags } from '../src/flags';
import { createTestDb } from './helpers';

let db: FlowDb;
let admin: pg.Pool;
let flags: Flags;

const key = (name: string) => `cf.int-${name}-${randomUUID().slice(0, 6)}`;

async function seedFlag(
  flagKey: string,
  row: { kind?: string; defaultOn?: boolean; rollout?: number; plans?: string[] | null } = {},
) {
  await admin.query(
    `INSERT INTO core.feature_flags (key, product, kind, default_on, rollout_percent, plans, expires_at)
     VALUES ($1, 'commentflow', $2, $3, $4, $5, now() + interval '30 days')`,
    [flagKey, row.kind ?? 'ops', row.defaultOn ?? false, row.rollout ?? 0, row.plans ?? null],
  );
}

async function seedWorkspace(): Promise<string> {
  const id = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    id,
    'Shop',
    `shop-${id}`,
  ]);
  return id;
}

beforeAll(async () => {
  db = createTestDb();
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('Thiếu TEST_DATABASE_ADMIN_URL');
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  flags = createFlags({ db, defaults: {} });
  await flags.start();
});
afterAll(async () => {
  await flags.stop();
  await db.close();
  await admin.end();
});

const waitUntil = async (predicate: () => Promise<boolean>, ms: number): Promise<number> => {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > ms) throw new Error(`không đạt điều kiện sau ${ms}ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
  return Date.now() - start;
};

describe('flags trên DB thật', () => {
  it('default_on, rollout 100%, 0% và flag chưa có', async () => {
    const ws = await seedWorkspace();
    const on = key('on');
    const off = key('off');
    const full = key('full');
    await seedFlag(on, { defaultOn: true });
    await seedFlag(off, { defaultOn: false });
    await seedFlag(full, { defaultOn: false, rollout: 100 });
    expect(await flags.isEnabled(on, { workspaceId: ws })).toBe(true);
    expect(await flags.isEnabled(off, { workspaceId: ws })).toBe(false);
    expect(await flags.isEnabled(full, { workspaceId: ws })).toBe(true);
    expect(await flags.isEnabled(key('khong-co'), { workspaceId: ws })).toBe(false);
  });

  it('override của workspace A không ảnh hưởng workspace B (RLS)', async () => {
    const [wsA, wsB] = [await seedWorkspace(), await seedWorkspace()];
    const f = key('ov');
    await seedFlag(f, { defaultOn: false });
    await admin.query(
      'INSERT INTO core.feature_flag_overrides (flag_key, workspace_id, enabled) VALUES ($1, $2, true)',
      [f, wsA],
    );
    await waitUntil(async () => (await flags.isEnabled(f, { workspaceId: wsA })) === true, 1500);
    expect(await flags.isEnabled(f, { workspaceId: wsB })).toBe(false);
  });

  it('kill_switch: default_on = false tắt toàn hệ thống dù rollout 100%; override vẫn thắng', async () => {
    const ws = await seedWorkspace();
    const f = key('kill');
    await seedFlag(f, { kind: 'kill_switch', defaultOn: false, rollout: 100 });
    expect(await flags.isEnabled(f, { workspaceId: ws })).toBe(false);
    await admin.query(
      'INSERT INTO core.feature_flag_overrides (flag_key, workspace_id, enabled) VALUES ($1, $2, true)',
      [f, ws],
    );
    await waitUntil(async () => (await flags.isEnabled(f, { workspaceId: ws })) === true, 1500);
  });

  it('gói cước: chỉ bật cho workspace thuộc gói trong danh sách', async () => {
    const ws = await seedWorkspace();
    const f = key('plan');
    await seedFlag(f, { kind: 'plan', defaultOn: true, plans: ['pro'] });
    expect(await flags.isEnabled(f, { workspaceId: ws, plan: 'pro' })).toBe(true);
    expect(await flags.isEnabled(f, { workspaceId: ws, plan: 'free' })).toBe(false);
  });

  it('đổi flag trong DB → cache mất hiệu lực trong dưới 1 giây (NOTIFY flags_changed)', async () => {
    const ws = await seedWorkspace();
    const f = key('notify');
    await seedFlag(f, { defaultOn: false });
    expect(await flags.isEnabled(f, { workspaceId: ws })).toBe(false); // đưa vào cache 30 giây

    await admin.query('UPDATE core.feature_flags SET default_on = true WHERE key = $1', [f]);
    const elapsed = await waitUntil(
      async () => (await flags.isEnabled(f, { workspaceId: ws })) === true,
      1000,
    );
    expect(elapsed).toBeLessThan(1000);
  });

  it('không có workspace: bỏ qua override và rollout', async () => {
    const f = key('sys');
    await seedFlag(f, { defaultOn: false, rollout: 100 });
    expect(await flags.isEnabled(f)).toBe(false);
  });
});

describe('khi không đọc được DB', () => {
  const brokenDb = () => createDb({ connectionString: 'postgresql://x:y@127.0.0.1:1/z', max: 1 });

  it('dùng default_on khai báo trong mã; failClosed thì tắt', async () => {
    const errors: unknown[] = [];
    const broken = brokenDb();
    const f = createFlags({
      db: broken,
      defaults: { 'cf.autosend': true, 'cf.tat': false },
      onReadError: (e) => errors.push(e),
    });
    expect(await f.isEnabled('cf.autosend')).toBe(true);
    expect(await f.isEnabled('cf.tat')).toBe(false);
    expect(await f.isEnabled('cf.autosend', {}, { failClosed: true })).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    await broken.close();
  });
});
