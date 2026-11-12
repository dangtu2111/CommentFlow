import { randomUUID } from 'node:crypto';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbChannelCheckStore } from '../src/jobs/channel-check';

/** Kiểm kênh: ghi quyền ĐÃ CẤP vào `channels.scopes` (đường hệ thống `withJob`), giữ nguyên khi không có dữ liệu mới. */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 3 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop kiểm kênh',
    `shop-${ws}`,
  ]);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

async function seedChannel(scopes: string[]) {
  const externalId = `page-${randomUUID()}`;
  const r = await admin.query(
    `INSERT INTO cf.channels (workspace_id, platform, external_id, name, scopes)
     VALUES ($1, 'facebook', $2, 'Page', $3::text[]) RETURNING id`,
    [ws, externalId, scopes],
  );
  return { id: r.rows[0].id as string, externalId };
}
const scopesOf = async (id: string) =>
  (await admin.query('SELECT scopes, last_check_result FROM cf.channels WHERE id = $1', [id]))
    .rows[0];

describe('createDbChannelCheckStore.save — quyền đã cấp', () => {
  it('có quyền đã cấp → thay `scopes` (kể cả mảng rỗng); không có → giữ nguyên', async () => {
    const store = createDbChannelCheckStore(db);
    const c = await seedChannel(['pages_show_list']);
    const ref = {
      id: c.id,
      workspaceId: ws,
      platform: 'facebook' as const,
      externalId: c.externalId,
    };

    await store.save(ref, 'ok', null, ['pages_read_engagement', 'pages_manage_metadata']);
    expect(await scopesOf(c.id)).toMatchObject({
      scopes: ['pages_read_engagement', 'pages_manage_metadata'],
      last_check_result: 'ok',
    });

    await store.save(ref, 'error', null); // không đọc được quyền lần này
    expect(await scopesOf(c.id)).toMatchObject({
      scopes: ['pages_read_engagement', 'pages_manage_metadata'],
      last_check_result: 'error',
    });

    await store.save(ref, 'ok', null, []); // đã bị thu hồi hết quyền
    expect((await scopesOf(c.id)).scopes).toEqual([]);
  });

  it('chỉ đổi kênh của workspace đó (workspace khác không bị ảnh hưởng)', async () => {
    const store = createDbChannelCheckStore(db);
    const c = await seedChannel(['x']);
    const other = randomUUID();
    await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
      other,
      'Shop khác',
      `shop-${other}`,
    ]);
    await store.save(
      { id: c.id, workspaceId: other, platform: 'facebook', externalId: c.externalId },
      'ok',
      null,
      ['pages_read_engagement'],
    );
    expect((await scopesOf(c.id)).scopes).toEqual(['x']);
  });
});
