import { isAppError } from '@flow/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { createAdminPool, createAppDb } from './helpers';

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

describe('listen (LISTEN/NOTIFY)', () => {
  it('nhận payload khi có NOTIFY và dừng nhận sau khi hủy đăng ký', async () => {
    const received: string[] = [];
    const stop = await db.listen('thu_kenh', (payload) => received.push(payload));
    await admin.query("SELECT pg_notify('thu_kenh', 'mot')");
    await waitFor(() => received.length === 1);
    expect(received).toEqual(['mot']);

    await stop();
    await admin.query("SELECT pg_notify('thu_kenh', 'hai')");
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toEqual(['mot']);
  });

  it('không nhận thông báo của kênh khác', async () => {
    const received: string[] = [];
    const stop = await db.listen('kenh_a', (p) => received.push(p));
    await admin.query("SELECT pg_notify('kenh_b', 'x')");
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toEqual([]);
    await stop();
  });

  it('từ chối tên kênh không an toàn (chống chèn SQL)', async () => {
    for (const bad of ['', 'a b', 'a;drop table x', 'A-B', '1abc']) {
      await expect(db.listen(bad, () => {})).rejects.toSatisfy(
        (e) => isAppError(e) && e.code === 'VALIDATION_FAILED',
      );
    }
  });
});
