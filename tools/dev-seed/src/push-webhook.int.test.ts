import { randomUUID } from 'node:crypto';
import { createDb } from '@flow/db/runtime';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupFixture,
  FIXTURE_CHANNEL_NAME,
  fixturePageId,
  pushFixtureWebhook,
} from './push-webhook';

/**
 * Lệnh dev đẩy webhook fixture: dùng đường THẬT (hàm DEFINER ghi `webhook_events`, role cf_app) rồi đẩy job `ingest` (ở đây giả bằng
 * hàm ghi lại). Kiểm kênh fixture được tạo MỘT lần, sự kiện + job đúng workspace, không đụng workspace khác, và `--cleanup` dọn sạch.
 */
const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu ${name}`);
  return v;
};

let admin: pg.Pool;
let appDb: ReturnType<typeof createDb>;
let ws: string;
let other: string;
const jobs: Array<{ workspaceId: string; eventId: string }> = [];
const ctx = () => ({
  admin,
  appDb,
  enqueue: async (job: { workspaceId: string; eventId: string }) => {
    jobs.push(job);
  },
});

beforeAll(async () => {
  admin = new pg.Pool({ connectionString: need('TEST_DATABASE_ADMIN_URL'), max: 2 });
  appDb = createDb({ connectionString: need('TEST_DATABASE_URL'), max: 2 });
  ws = randomUUID();
  other = randomUUID();
  const name = `Shop fixture ${ws.slice(0, 6)}`;
  await admin.query(
    'INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)',
    [ws, name, `fx-${ws}`, other, `Shop khác ${other.slice(0, 6)}`, `fx-${other}`],
  );
});
afterAll(async () => {
  await appDb.close();
  await admin.end();
});

const channels = async (workspace: string) =>
  (
    await admin.query(
      'SELECT name, status, webhook_subscribed FROM cf.channels WHERE workspace_id = $1',
      [workspace],
    )
  ).rows;

describe('dev:push-webhook', () => {
  it('tạo kênh fixture MỘT lần, ghi sự kiện đúng workspace và đẩy job ingest; gọi lại không nhân đôi kênh', async () => {
    const first = await pushFixtureWebhook(ctx(), {
      workspace: ws,
      text: 'Áo thun basic giá bn?',
      cleanup: false,
    });
    const second = await pushFixtureWebhook(ctx(), {
      workspace: ws,
      text: 'ship về Hà Nội?',
      cleanup: false,
    });
    expect(first.workspaceId).toBe(ws);
    expect(first.eventId).not.toBe(second.eventId);
    expect(await channels(ws)).toEqual([
      { name: FIXTURE_CHANNEL_NAME, status: 'connected', webhook_subscribed: true },
    ]);
    expect(jobs.filter((j) => j.workspaceId === ws).map((j) => j.eventId)).toEqual([
      first.eventId,
      second.eventId,
    ]);
    const ev = await admin.query('SELECT status FROM cf.webhook_events WHERE id = $1', [
      first.eventId,
    ]);
    expect(ev.rows[0]?.status).toBe('received');
    // Workspace khác không bị đụng.
    expect(await channels(other)).toEqual([]);
  });

  it('tìm workspace theo TÊN; tên không có/trùng → lỗi rõ', async () => {
    const name = (
      await admin.query<{ name: string }>('SELECT name FROM core.workspaces WHERE id = $1', [ws])
    ).rows[0]?.name;
    const byName = await pushFixtureWebhook(ctx(), {
      workspace: name as string,
      text: 'x',
      cleanup: false,
    });
    expect(byName.workspaceId).toBe(ws);
    await expect(
      pushFixtureWebhook(ctx(), { workspace: 'không có workspace này', text: 'x', cleanup: false }),
    ).rejects.toThrow(/Không thấy/);
  });

  it('--cleanup dọn bình luận, bản nháp, bài và kênh fixture; không đụng dữ liệu khác của workspace', async () => {
    // Dữ liệu "thật" cùng workspace phải còn nguyên.
    const realChannel = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page thật') RETURNING id",
        [ws, `real-${randomUUID()}`],
      )
    ).rows[0].id;
    // Mô phỏng ingest đã tạo bình luận + bản nháp cho kênh fixture.
    const fx = (
      await admin.query('SELECT id FROM cf.channels WHERE workspace_id = $1 AND external_id = $2', [
        ws,
        fixturePageId(ws),
      ])
    ).rows[0].id;
    const post = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [ws, fx, `p-${randomUUID()}`],
      )
    ).rows[0].id;
    const comment = (
      await admin.query(
        "INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, text, status, ingest_source) VALUES ($1, $2, $3, $4, 'u', 'x', 'new', 'webhook') RETURNING id",
        [ws, fx, post, `c-${randomUUID()}`],
      )
    ).rows[0].id;
    await admin.query(
      "INSERT INTO cf.drafts (workspace_id, target_type, target_id, text, lang, action) VALUES ($1, 'comment', $2, 'câu', 'vi', 'answer')",
      [ws, comment],
    );
    const done = await cleanupFixture(admin, ws);
    expect(done).toMatchObject({ workspaceId: ws, comments: 1, drafts: 1 });
    expect((await channels(ws)).map((c) => c.name)).toEqual(['Page thật']);
    const left = await admin.query('SELECT count(*) n FROM cf.channels WHERE id = $1', [
      realChannel,
    ]);
    expect(Number(left.rows[0].n)).toBe(1);
    // Chạy lại khi không còn gì → không lỗi.
    expect(await cleanupFixture(admin, ws)).toMatchObject({ comments: 0, drafts: 0 });
  });
});
