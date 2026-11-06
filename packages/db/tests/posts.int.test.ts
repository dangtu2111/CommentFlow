import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listPosts, type PostsFilter } from '../src/queries/posts';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** POSTS-LIST (FR-060): danh sách bài — lọc nền tảng/kênh/loại, tìm kiếm, sắp xếp, phân trang, cô lập workspace. */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let userA: string;
let stranger: string;
let fbA: string;
let igA: string;
const base = Date.UTC(2026, 10, 1, 8, 0, 0);

async function channel(ws: string, platform: string, name: string): Promise<string> {
  const r = await admin.query(
    'INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, $2, $3, $4) RETURNING id',
    [ws, platform, `ext-${randomUUID()}`, name],
  );
  return r.rows[0].id;
}

async function post(input: {
  ws: string;
  channelId: string;
  message?: string | null;
  externalId?: string;
  isAd?: boolean;
  minutes: number;
  pending?: number;
  comments?: number;
}): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.posts (workspace_id, channel_id, external_id, message, is_ad, created_time, pending_count, comment_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.ws,
      input.channelId,
      input.externalId ?? `post-${randomUUID()}`,
      input.message ?? null,
      input.isAd ?? false,
      new Date(base + input.minutes * 60_000),
      input.pending ?? 0,
      input.comments ?? 0,
    ],
  );
  return r.rows[0].id;
}

const run = <T>(
  who: 'a' | 'stranger',
  fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>,
) => db.withActor(wsA, who === 'a' ? userA : stranger, fn);
const filter = (over: Partial<PostsFilter> = {}): PostsFilter => ({
  sort: 'pending',
  page: 1,
  ...over,
});
const list = (over: Partial<PostsFilter> = {}) =>
  run('a', (tx) => listPosts(tx, wsA, filter(over)));
const msgs = (items: { message: string | null }[]) => items.map((i) => i.message);

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  userA = await seedUser(admin, 'posts-a');
  stranger = await seedUser(admin, 'posts-stranger');
  await seedMember(admin, wsA, userA, 'staff');
  fbA = await channel(wsA, 'facebook', 'Page FB A');
  igA = await channel(wsA, 'instagram', 'IG A');
  const fbB = await channel(wsB, 'facebook', 'Page FB B');
  await post({
    ws: wsA,
    channelId: fbA,
    message: 'Váy hoa nhí',
    minutes: 1,
    pending: 5,
    comments: 9,
  });
  await post({
    ws: wsA,
    channelId: fbA,
    message: 'Áo sơ mi 100%',
    minutes: 2,
    comments: 3,
    isAd: true,
  });
  await post({ ws: wsA, channelId: igA, message: 'Túi xách', minutes: 3, pending: 5, comments: 4 });
  await post({ ws: wsA, channelId: fbA, message: null, externalId: 'fb_post_777', minutes: 4 });
  await post({ ws: wsB, channelId: fbB, message: 'Bài workspace B', minutes: 5, pending: 99 });
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-060 danh sách bài', () => {
  it('FR-060 chỉ trả bài của workspace mình kèm tên kênh, nền tảng, số bình luận/chờ', async () => {
    const page = await list();
    expect(page.total).toBe(4);
    expect(msgs(page.items)).not.toContain('Bài workspace B');
    const vay = page.items.find((i) => i.message === 'Váy hoa nhí');
    expect(vay).toMatchObject({
      channelName: 'Page FB A',
      platform: 'facebook',
      commentCount: 9,
      pendingCount: 5,
      isAd: false,
    });
  });

  it('FR-060 người ngoài workspace (RLS) thấy rỗng', async () => {
    const page = await run('stranger', (tx) => listPosts(tx, wsA, filter()));
    expect(page).toMatchObject({ items: [], total: 0 });
  });

  it('FR-060 sắp xếp "chờ nhiều nhất": chờ giảm dần, hòa → mới hơn trước', async () => {
    expect(msgs((await list()).items)).toEqual(['Túi xách', 'Váy hoa nhí', null, 'Áo sơ mi 100%']);
  });

  it('FR-060 sắp xếp "mới nhất" theo created_time giảm dần', async () => {
    expect(msgs((await list({ sort: 'newest' })).items)).toEqual([
      null,
      'Túi xách',
      'Áo sơ mi 100%',
      'Váy hoa nhí',
    ]);
  });

  it('FR-060 lọc nền tảng và kênh', async () => {
    expect(msgs((await list({ platform: 'instagram' })).items)).toEqual(['Túi xách']);
    expect((await list({ channelId: fbA })).total).toBe(3);
  });

  it('FR-060 lọc loại bài: quảng cáo / thường', async () => {
    expect(msgs((await list({ kind: 'ads' })).items)).toEqual(['Áo sơ mi 100%']);
    expect((await list({ kind: 'organic' })).total).toBe(3);
  });

  it('FR-060 tìm theo nội dung (không phân biệt dấu/hoa thường), mã bài, và thoát % _', async () => {
    expect(msgs((await list({ search: 'VAY HOA' })).items)).toEqual(['Váy hoa nhí']);
    expect((await list({ search: 'fb_post_777' })).total).toBe(1);
    expect((await list({ search: '100%' })).total).toBe(1);
    expect((await list({ search: '%' })).total).toBe(1); // chỉ "100%"
    expect((await list({ search: '_' })).total).toBe(1); // chỉ "fb_post_777"
  });

  it('FR-060 phân trang: total giữ nguyên, trang cuối ít bài, trang vượt → rỗng', async () => {
    const p1 = await list({ sort: 'newest', limit: 3 });
    expect(p1.items).toHaveLength(3);
    expect(p1.total).toBe(4);
    const p2 = await list({ sort: 'newest', limit: 3, page: 2 });
    expect(msgs(p2.items)).toEqual(['Váy hoa nhí']);
    expect((await list({ limit: 3, page: 5 })).items).toEqual([]);
  });
});
