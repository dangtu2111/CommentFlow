import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listChannels } from '../src/queries/channels';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** Nút "Kiểm tra toàn bộ kết nối": kết quả kiểm do HỆ THỐNG ghi; người dùng (kể cả Owner) không ghi được. */
let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let owner: string;
let channelId: string;

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'health-owner');
  await seedMember(admin, ws, owner, 'owner');
  const r = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [ws, `ext-${randomUUID()}`],
  );
  channelId = r.rows[0].id as string;
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('channels.last_checked_at / last_check_result', () => {
  it('mặc định null; listChannels trả đúng', async () => {
    const [row] = await app.withActor(ws, owner, (tx) => listChannels(tx, ws));
    expect(row?.lastCheckedAt).toBeNull();
    expect(row?.lastCheckResult).toBeNull();
    expect(Array.isArray(row?.scopes)).toBe(true);
  });

  it('Owner (đường người dùng) KHÔNG ghi được kết quả kiểm', async () => {
    const code = await expectRejectCode(
      app.withActor(ws, owner, (tx) =>
        tx.execute(
          sql`UPDATE cf.channels SET last_check_result = 'ok', last_checked_at = now() WHERE id = ${channelId}::uuid`,
        ),
      ),
    );
    expect(code).toBeDefined();
  });

  it('worker (withJob) ghi được; trang đọc lại thấy', async () => {
    await worker.withJob(ws, async (tx) => {
      await tx.execute(
        sql`UPDATE cf.channels SET last_check_result = 'token_invalid', last_checked_at = now() WHERE id = ${channelId}::uuid`,
      );
    });
    const [row] = await app.withActor(ws, owner, (tx) => listChannels(tx, ws));
    expect(row?.lastCheckResult).toBe('token_invalid');
    expect(row?.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('giá trị ngoài danh sách bị CHECK từ chối', async () => {
    const code = await expectRejectCode(
      worker.withJob(ws, async (tx) => {
        await tx.execute(
          sql`UPDATE cf.channels SET last_check_result = 'bay-bong' WHERE id = ${channelId}::uuid`,
        );
      }),
    );
    expect(code).toBe('23514');
  });
});
