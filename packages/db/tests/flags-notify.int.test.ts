import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { createAdminPool, createAppDb, newId, seedWorkspace } from './helpers';

let admin: pg.Pool;
let db: FlowDb;
beforeAll(() => {
  admin = createAdminPool();
  db = createAppDb();
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const waitFor = async (predicate: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('hết thời gian chờ thông báo');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('trigger NOTIFY flags_changed', () => {
  it('phát thông báo khi thêm/sửa/xóa flag và override', async () => {
    const received: string[] = [];
    const stop = await db.listen('flags_changed', (p) => received.push(p));
    const key = `cf.notify-${newId().slice(0, 8)}`;
    const ws = await seedWorkspace(admin);

    await admin.query(
      "INSERT INTO core.feature_flags (key, product, kind, default_on) VALUES ($1, 'commentflow', 'ops', false)",
      [key],
    );
    await waitFor(() => received.includes('feature_flags'));

    await admin.query('UPDATE core.feature_flags SET default_on = true WHERE key = $1', [key]);
    await admin.query(
      'INSERT INTO core.feature_flag_overrides (flag_key, workspace_id, enabled) VALUES ($1, $2, true)',
      [key, ws],
    );
    await waitFor(() => received.includes('feature_flag_overrides'));

    await admin.query('DELETE FROM core.feature_flags WHERE key = $1', [key]);
    await waitFor(() => received.filter((p) => p === 'feature_flags').length >= 3);
    await stop();
  });

  it('không phát thông báo khi giao dịch bị ROLLBACK', async () => {
    const received: string[] = [];
    const stop = await db.listen('flags_changed', (p) => received.push(p));
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO core.feature_flags (key, product, kind) VALUES ('cf.rollback-thu', 'commentflow', 'ops')",
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toEqual([]);
    await stop();
  });
});
