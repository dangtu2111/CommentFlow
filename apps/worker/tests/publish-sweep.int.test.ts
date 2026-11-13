import { randomUUID } from 'node:crypto';
import { PlatformError } from '@flow/connectors';
import {
  claimPublishTargets,
  createDb,
  type FlowDb,
  listDuePublishWorkspaces,
  recordPublishResult,
} from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLISH_BATCH, PUBLISH_MAX_WORKSPACES, runPublishSweep } from '../src/jobs/publish-sweep';

/**
 * POST-PUBLISHING (migration 0090): job quét đăng bài chạy với hàm DB THẬT (cf_worker) và connector GIẢ (test tự cắm qua tham số, không phải bản giả lúc chạy ứng dụng).
 * Chứng minh chuỗi liệt kê workspace → nhận mục tiêu → đăng → ghi kết quả nối đúng, và tối đa một lần.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let pageExternalId: string;
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const sweep = (
  publish: (ch: { externalId: string }, text: string) => Promise<{ externalId: string }>,
) =>
  runPublishSweep({
    listDueWorkspaces: async () =>
      (await db.withSystem((tx) => listDuePublishWorkspaces(tx, PUBLISH_MAX_WORKSPACES))).filter(
        (id) => id === ws,
      ),
    claim: (workspaceId) => db.withJob(workspaceId, (tx) => claimPublishTargets(tx, PUBLISH_BATCH)),
    record: (workspaceId, targetId, outcome, detail) =>
      db.withJob(workspaceId, (tx) => recordPublishResult(tx, targetId, outcome, detail)),
    publish: publish as never,
    loadMedia: async () => undefined,
    logger: quiet,
  });

async function dueTarget(
  scopes: string[] = ['pages_manage_posts'],
): Promise<{ postId: string; targetId: string }> {
  await admin.query('UPDATE cf.channels SET scopes = $2 WHERE id = $1', [channel, scopes]);
  const post = await admin.query(
    "INSERT INTO cf.publish_posts (workspace_id, message, status, scheduled_at) VALUES ($1, 'Bài thử', 'scheduled', now() - interval '1 minute') RETURNING id",
    [ws],
  );
  const target = await admin.query(
    'INSERT INTO cf.publish_post_targets (workspace_id, post_id, channel_id) VALUES ($1, $2, $3) RETURNING id',
    [ws, post.rows[0].id, channel],
  );
  return { postId: post.rows[0].id, targetId: target.rows[0].id };
}
const stateOf = async (postId: string) =>
  (
    await admin.query(
      'SELECT p.status AS post, t.status AS target, t.external_post_id, t.error_code FROM cf.publish_posts p JOIN cf.publish_post_targets t ON t.post_id = p.id WHERE p.id = $1',
      [postId],
    )
  ).rows[0];

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 4 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop đăng bài',
    `shop-${ws}`,
  ]);
  pageExternalId = `${Date.now()}`;
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status) VALUES ($1, 'facebook', $2, 'Page', 'connected') RETURNING id",
      [ws, pageExternalId],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('runPublishSweep với DB thật', () => {
  it('bài đến hạn được đăng đúng một lần: connector nhận đúng Page + nội dung; DB ghi published kèm id bài; lượt quét sau không đăng lại', async () => {
    const { postId } = await dueTarget();
    const calls: Array<{ page: string; text: string }> = [];
    const publish = async (ch: { externalId: string }, text: string) => {
      calls.push({ page: ch.externalId, text });
      return { externalId: `${pageExternalId}_99` };
    };
    const first = await sweep(publish);
    expect(first).toMatchObject({ claimed: 1, published: 1 });
    expect(calls).toEqual([{ page: pageExternalId, text: 'Bài thử' }]);
    expect(await stateOf(postId)).toMatchObject({
      post: 'published',
      target: 'published',
      external_post_id: `${pageExternalId}_99`,
    });
    const second = await sweep(publish);
    expect(second.claimed).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('thiếu quyền pages_manage_posts → failed "missing_permission", KHÔNG gọi Facebook', async () => {
    const { postId } = await dueTarget([]);
    let called = false;
    const result = await sweep(async () => {
      called = true;
      return { externalId: 'x' };
    });
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(called).toBe(false);
    expect(await stateOf(postId)).toMatchObject({
      post: 'failed',
      target: 'failed',
      error_code: 'missing_permission',
    });
  });

  it('lỗi mạng sau khi gửi → unknown và KHÔNG BAO GIỜ đăng lại ở các lượt quét sau', async () => {
    const { postId } = await dueTarget();
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      throw new PlatformError('UNKNOWN', { message: 'facebook_network_error' });
    };
    await sweep(flaky);
    await sweep(flaky);
    await sweep(flaky);
    expect(calls).toBe(1);
    expect(await stateOf(postId)).toMatchObject({
      post: 'failed',
      target: 'unknown',
      error_code: 'unknown_result',
    });
  });

  it('giới hạn tốc độ → thử lại ở lượt sau (tối đa 3 lần) rồi failed "rate_limited"', async () => {
    const { postId } = await dueTarget();
    let calls = 0;
    const limited = async () => {
      calls += 1;
      throw new PlatformError('RATE_LIMIT');
    };
    for (let i = 0; i < 5; i += 1) await sweep(limited);
    expect(calls).toBe(3);
    expect(await stateOf(postId)).toMatchObject({
      post: 'failed',
      target: 'failed',
      error_code: 'rate_limited',
    });
  });
});
