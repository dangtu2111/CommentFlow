import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { hydratePostFields } from '../src/queries/post-hydrate';
import { createAdminPool, createAppDb, seedWorkspace } from './helpers';

/** POST-HYDRATE: điền nội dung bài từ nền tảng — chỉ ô còn TRỐNG, chỉ trong workspace của bài, chỉ hệ thống (`withJob`). */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let postId: string;
let otherPostId: string;

const row = async (id: string) =>
  (
    await admin.query(
      'SELECT message, permalink, media_url, created_time FROM cf.posts WHERE id = $1',
      [id],
    )
  ).rows[0];

const seedPost = async (workspace: string, external: string) => {
  const channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
      [workspace, `page-${external}`],
    )
  ).rows[0].id as string;
  return (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [workspace, channel, external],
    )
  ).rows[0].id as string;
};

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  postId = await seedPost(ws, 'hydrate-1');
  otherPostId = await seedPost(other, 'hydrate-2');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

const INFO = {
  message: 'Áo thun mới về',
  permalink: 'https://www.facebook.com/p/1',
  mediaUrl: 'https://scontent.xx.fbcdn.net/a.jpg',
  createdTime: new Date('2026-11-05T03:00:00Z'),
};

describe('hydratePostFields', () => {
  it('điền cả bốn ô còn trống; trả true', async () => {
    expect(await db.withJob(ws, (tx) => hydratePostFields(tx, ws, postId, INFO))).toBe(true);
    expect(await row(postId)).toMatchObject({
      message: 'Áo thun mới về',
      permalink: 'https://www.facebook.com/p/1',
      media_url: 'https://scontent.xx.fbcdn.net/a.jpg',
    });
    expect((await row(postId)).created_time).toEqual(new Date('2026-11-05T03:00:00Z'));
  });

  it('KHÔNG ghi đè ô đã có; chạy lại không đổi gì và trả false', async () => {
    const again = {
      message: 'Nội dung khác',
      permalink: 'https://www.facebook.com/p/2',
      mediaUrl: null,
      createdTime: null,
    };
    expect(await db.withJob(ws, (tx) => hydratePostFields(tx, ws, postId, again))).toBe(false);
    expect((await row(postId)).message).toBe('Áo thun mới về');
  });

  it('bài ảnh không chữ: chỉ điền ô có giá trị; ô khác để NULL', async () => {
    const photo = await seedPost(ws, 'hydrate-photo');
    expect(
      await db.withJob(ws, (tx) =>
        hydratePostFields(tx, ws, photo, {
          message: null,
          permalink: 'https://www.facebook.com/p/3',
          mediaUrl: null,
          createdTime: null,
        }),
      ),
    ).toBe(true);
    expect(await row(photo)).toMatchObject({
      message: null,
      permalink: 'https://www.facebook.com/p/3',
      media_url: null,
    });
  });

  it('không có gì để điền → false (không ghi); bài của workspace khác (RLS) không bị đổi', async () => {
    const empty = { message: null, permalink: null, mediaUrl: null, createdTime: null };
    expect(await db.withJob(ws, (tx) => hydratePostFields(tx, ws, postId, empty))).toBe(false);
    expect(await db.withJob(ws, (tx) => hydratePostFields(tx, ws, otherPostId, INFO))).toBe(false);
    expect((await row(otherPostId)).message).toBeNull();
  });
});
