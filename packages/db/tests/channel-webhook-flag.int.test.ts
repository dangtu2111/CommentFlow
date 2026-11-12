import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setChannelWebhookSubscribed } from '../src/channel-webhook';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * Cờ `channels.webhook_subscribed` (migration 0088): web chỉ có kết nối cf_app nên `withJob` không phải ngữ cảnh hệ thống (ADR 011)
 * và trigger chặn đổi cờ. Hàm DEFINER cho OWNER đổi cờ của kênh Facebook ĐÃ KẾT NỐI trong workspace của mình; Staff/người lạ bị từ chối;
 * kênh của workspace khác / đã ngắt → không đổi (false).
 */
const RLS = '42501';
let admin: pg.Pool;
let app: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let channel: string;
let revoked: string;
let instagram: string;
let otherChannel: string;

async function seedChannel(workspaceId: string, platform: string, status: string, ext: string) {
  const r = await admin.query(
    'INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [workspaceId, platform, ext, `Page ${ext}`, status],
  );
  return r.rows[0].id as string;
}
const flag = async (id: string) =>
  (await admin.query('SELECT webhook_subscribed FROM cf.channels WHERE id = $1', [id])).rows[0]
    .webhook_subscribed as boolean;

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'whf-owner');
  staff = await seedUser(admin, 'whf-staff');
  otherOwner = await seedUser(admin, 'whf-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
  channel = await seedChannel(ws, 'facebook', 'connected', 'whf-1');
  revoked = await seedChannel(ws, 'facebook', 'revoked', 'whf-2');
  instagram = await seedChannel(ws, 'instagram', 'connected', 'whf-3');
  otherChannel = await seedChannel(other, 'facebook', 'connected', 'whf-4');
});
afterAll(async () => {
  await app.close();
  await admin.end();
});

describe('setChannelWebhookSubscribed', () => {
  it('Owner đặt true rồi false cho kênh Facebook đã kết nối của mình', async () => {
    expect(
      await app.withActor(ws, owner, (tx) => setChannelWebhookSubscribed(tx, channel, true)),
    ).toBe(true);
    expect(await flag(channel)).toBe(true);
    expect(
      await app.withActor(ws, owner, (tx) => setChannelWebhookSubscribed(tx, channel, false)),
    ).toBe(true);
    expect(await flag(channel)).toBe(false);
  });

  it('Staff bị từ chối (42501) và cờ không đổi', async () => {
    expect(
      await expectRejectCode(
        app.withActor(ws, staff, (tx) => setChannelWebhookSubscribed(tx, channel, true)),
      ),
    ).toBe(RLS);
    expect(await flag(channel)).toBe(false);
  });

  it('kênh của workspace khác, kênh đã ngắt, kênh không phải Facebook → không đổi (false)', async () => {
    for (const id of [otherChannel, revoked, instagram]) {
      expect(
        await app.withActor(ws, owner, (tx) => setChannelWebhookSubscribed(tx, id, true)),
      ).toBe(false);
      expect(await flag(id)).toBe(false);
    }
  });

  it('Owner workspace khác không đổi được cờ của kênh workspace này', async () => {
    expect(
      await app.withActor(other, otherOwner, (tx) =>
        setChannelWebhookSubscribed(tx, channel, true),
      ),
    ).toBe(false);
    expect(await flag(channel)).toBe(false);
  });

  it('người dùng vẫn KHÔNG sửa trực tiếp cột (trigger giữ nguyên)', async () => {
    expect(
      await expectRejectCode(
        app.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`UPDATE cf.channels SET webhook_subscribed = true WHERE id = ${channel}::uuid`,
          ),
        ),
      ),
    ).toBe(RLS);
  });
});
