import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listWebhookSilentChannels } from '../src/queries/webhook-silent';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** FR-023 (QP3): kênh "webhook im lặng" = quét bù thấy bình luận mà webhook chưa báo trong 24 giờ; chỉ Owner đọc. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;

async function channel(workspaceId: string, name: string, externalId: string, subscribed = true) {
  await admin.query(
    'INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, webhook_subscribed) VALUES ($1, $2, $3, $4, $5, $6)',
    [workspaceId, 'facebook', externalId, name, 'connected', subscribed],
  );
}

async function event(
  workspaceId: string,
  pageExternalId: string,
  source: string | null,
  hoursAgo: number,
  kind = 'comment_created',
) {
  const payload = {
    kind,
    channelExternalId: pageExternalId,
    ...(source ? { source } : {}),
  };
  await admin.query(
    `INSERT INTO cf.webhook_events (workspace_id, platform, event_hash, payload, status, created_at)
     VALUES ($1, 'facebook', $2, $3::jsonb, 'done', now() - make_interval(hours => $4))`,
    [workspaceId, randomUUID(), JSON.stringify(payload), hoursAgo],
  );
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  const ownerUser = await seedUser(admin, 'o');
  const staffUser = await seedUser(admin, 's');
  owner = ownerUser;
  staff = staffUser;
  await seedMember(admin, ws, ownerUser, 'owner');
  await seedMember(admin, ws, staffUser, 'staff');
  // Hai workspace dùng chung một Page (đúng ràng buộc unique theo workspace).
  await channel(ws, 'Im lặng', 'P-SILENT');
  await channel(ws, 'Webhook hồi phục', 'P-RECOVERED');
  await channel(ws, 'Chỉ backfill', 'P-BACKFILL');
  await channel(ws, 'Sự kiện cũ', 'P-OLD');
  await channel(ws, 'Chưa đăng ký webhook', 'P-NOSUB', false);
  await channel(ws, 'Bình thường', 'P-OK');
  await channel(other, 'Kênh người khác', 'P-OTHER');

  await event(ws, 'P-SILENT', 'polling', 2);
  await event(ws, 'P-RECOVERED', 'polling', 3);
  await event(ws, 'P-RECOVERED', null, 1); // webhook báo SAU lần quét bù → hồi phục
  await event(ws, 'P-BACKFILL', 'backfill', 2);
  await event(ws, 'P-OLD', 'polling', 30); // ngoài cửa sổ 24 giờ
  await event(ws, 'P-NOSUB', 'polling', 2);
  await event(ws, 'P-OK', null, 2);
  await event(other, 'P-OTHER', 'polling', 2);
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-023 listWebhookSilentChannels', () => {
  it('chỉ kênh connected + đã đăng ký webhook có sự kiện polling trong 24 giờ chưa được webhook theo sau', async () => {
    const rows = await db.withActor(ws, owner, (tx) => listWebhookSilentChannels(tx, ws));
    expect(rows.map((r) => r.name)).toEqual(['Im lặng']);
    expect(
      Object.keys(rows[0] ?? {})
        .sort()
        .join(),
    ).toBe('id,name');
  });

  it('Staff không đọc được nội dung webhook_events → danh sách rỗng (không lỗi)', async () => {
    expect(await db.withActor(ws, staff, (tx) => listWebhookSilentChannels(tx, ws))).toEqual([]);
  });

  it('không rò workspace khác (truyền id workspace khác → rỗng)', async () => {
    expect(await db.withActor(ws, owner, (tx) => listWebhookSilentChannels(tx, other))).toEqual([]);
  });
});
