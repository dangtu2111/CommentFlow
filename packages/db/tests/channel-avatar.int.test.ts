import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setChannelAvatar } from '../src/channel-tokens';
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

/** CHANNEL-AVATAR (migration 0093): chỉ hệ thống (worker withJob) ghi ảnh đại diện kênh; URL phải https; cô lập workspace. */
const RLS = '42501';
const INVALID = '22023';
let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let channel: string;

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'avatar-owner');
  await seedMember(admin, ws, owner, 'owner');
  const r = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [ws, `ext-${randomUUID()}`],
  );
  channel = r.rows[0].id as string;
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('set_channel_avatar', () => {
  it('worker ghi URL https; ghi lại cùng URL → false; đổi URL → true; listChannels trả avatarUrl', async () => {
    const url = 'https://scontent.fbcdn.net/page.jpg?oh=1';
    expect(await worker.withJob(ws, (tx) => setChannelAvatar(tx, channel, url))).toBe(true);
    expect(await worker.withJob(ws, (tx) => setChannelAvatar(tx, channel, url))).toBe(false);
    expect(
      await worker.withJob(ws, (tx) => setChannelAvatar(tx, channel, 'https://x.fbcdn.net/b.jpg')),
    ).toBe(true);
    const list = await app.withActor(ws, owner, (tx) => listChannels(tx, ws));
    expect(list.find((c) => c.id === channel)?.avatarUrl).toBe('https://x.fbcdn.net/b.jpg');
  });

  it('URL không phải https, có khoảng trắng hoặc quá dài → 22023', async () => {
    for (const bad of [
      'http://x.vn/a.jpg',
      'javascript:alert(1)',
      'https://x.vn/a b.jpg',
      `https://x.vn/${'a'.repeat(2100)}`,
    ]) {
      expect(
        await expectRejectCode(worker.withJob(ws, (tx) => setChannelAvatar(tx, channel, bad))),
      ).toBe(INVALID);
    }
  });

  it('Owner (web) không ghi được (42501); worker của workspace khác không ghi được kênh này', async () => {
    expect(
      await expectRejectCode(
        app.withActor(ws, owner, (tx) =>
          setChannelAvatar(tx, channel, 'https://x.fbcdn.net/c.jpg'),
        ),
      ),
    ).toBe(RLS);
    expect(
      await worker.withJob(other, (tx) =>
        setChannelAvatar(tx, channel, 'https://x.fbcdn.net/d.jpg'),
      ),
    ).toBe(false);
  });
});
