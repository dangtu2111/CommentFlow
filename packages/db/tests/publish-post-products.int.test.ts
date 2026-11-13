import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  claimPublishTargets,
  listPickableProducts,
  listPublishPostProductIds,
  recordPublishResult,
  savePublishPost,
} from '../src/publish-posts';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * COMPOSER-PRODUCT-TAG (migration 0091, Q-PUB3): Owner chọn sản phẩm lúc soạn (= xác nhận); khi bài ĐĂNG THÀNH CÔNG hệ thống tạo `cf.posts` và liên kết
 * "đã xác nhận" với confirmed_by = Owner. Không nới RLS của post_products; lỗi gắn sản phẩm không làm hỏng việc ghi kết quả đăng.
 */
const RLS = '42501';
const INVALID = '22023';

let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let fb: string;
let pA: string;
let pB: string;
let pArchived: string;
let pOther: string;

async function product(workspaceId: string, name: string, status = 'active') {
  const r = await admin.query(
    'INSERT INTO cf.products (workspace_id, name, search_text, status, price_vnd) VALUES ($1, $2, $2, $3, 199000) RETURNING id',
    [workspaceId, name, status],
  );
  return r.rows[0].id as string;
}
const asOwner = <T>(fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>) =>
  app.withActor(ws, owner, fn);
const asSystem = <T>(fn: (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) => Promise<T>) =>
  worker.withJob(ws, fn);
const SOON = () => new Date(Date.now() + 10 * 60_000);
const dueNow = (id: string) =>
  admin.query(
    "UPDATE cf.publish_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1",
    [id],
  );

async function publish(productIds: string[], externalId: string) {
  const id = await asOwner((tx) =>
    savePublishPost(tx, {
      message: 'Áo mới về',
      channelIds: [fb],
      scheduledAt: SOON(),
      productIds,
    }),
  );
  await dueNow(id);
  const target = (await asSystem((tx) => claimPublishTargets(tx, 50))).find((c) => c.postId === id);
  return asSystem((tx) =>
    recordPublishResult(tx, target?.targetId as string, 'published', {
      externalPostId: externalId,
    }),
  );
}

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'ptag-owner');
  staff = await seedUser(admin, 'ptag-staff');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name, status, scopes) VALUES ($1, 'facebook', $2, 'Page', 'connected', ARRAY['pages_manage_posts']) RETURNING id",
    [ws, `ext-${randomUUID()}`],
  );
  fb = ch.rows[0].id;
  pA = await product(ws, 'Áo thun A');
  pB = await product(ws, 'Quần B');
  pArchived = await product(ws, 'Cũ', 'archived');
  pOther = await product(other, 'Của workspace khác');
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('chọn sản phẩm khi soạn', () => {
  it('lưu theo thứ tự, đọc lại đúng thứ tự; sửa bài thay toàn bộ; bỏ trùng', async () => {
    const id = await asOwner((tx) =>
      savePublishPost(tx, { message: 'x', channelIds: [], productIds: [pB, pA, pB] }),
    );
    expect(await asOwner((tx) => listPublishPostProductIds(tx, ws, id))).toEqual([pB, pA]);
    await asOwner((tx) =>
      savePublishPost(tx, { id, message: 'x', channelIds: [], productIds: [pA] }),
    );
    expect(await asOwner((tx) => listPublishPostProductIds(tx, ws, id))).toEqual([pA]);
    await asOwner((tx) => savePublishPost(tx, { id, message: 'x', channelIds: [] }));
    expect(await asOwner((tx) => listPublishPostProductIds(tx, ws, id))).toEqual([]);
  });

  it('sản phẩm đã lưu trữ, của workspace khác hoặc quá 5 → 22023', async () => {
    const six = [pA, pB, randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const productIds of [[pArchived], [pOther], six]) {
      expect(
        await expectRejectCode(
          asOwner((tx) => savePublishPost(tx, { message: 'x', channelIds: [], productIds })),
        ),
      ).toBe(INVALID);
    }
  });

  it('Staff không gắn được (42501); danh sách chọn chỉ có sản phẩm đang bán của workspace mình', async () => {
    expect(
      await expectRejectCode(
        app.withActor(ws, staff, (tx) =>
          savePublishPost(tx, { message: 'x', channelIds: [], productIds: [pA] }),
        ),
      ),
    ).toBe(RLS);
    const names = (await asOwner((tx) => listPickableProducts(tx, ws))).map((p) => p.name);
    expect([...names].sort()).toEqual(['Quần B', 'Áo thun A'].sort());
  });
});

describe('đăng thành công → liên kết đã xác nhận', () => {
  it('tạo cf.posts và post_products confirmed (chính = đầu tiên, confirmed_by = Owner, không do AI)', async () => {
    expect(await publish([pB, pA], 'ext_page_1')).toBe(true);
    const post = await admin.query(
      "SELECT id, message FROM cf.posts WHERE channel_id = $1 AND external_id = 'ext_page_1'",
      [fb],
    );
    expect(post.rows[0].message).toBe('Áo mới về');
    const links = await admin.query(
      'SELECT product_id, status, is_primary, suggested_by_ai, confirmed_by FROM cf.post_products WHERE post_id = $1 ORDER BY is_primary DESC',
      [post.rows[0].id],
    );
    expect(links.rows).toHaveLength(2);
    expect(links.rows[0]).toMatchObject({
      product_id: pB,
      status: 'confirmed',
      is_primary: true,
      suggested_by_ai: false,
      confirmed_by: owner,
    });
    expect(links.rows[1]).toMatchObject({ product_id: pA, is_primary: false });
  });

  it('bài không chọn sản phẩm → không tạo cf.posts; dòng cf.posts có sẵn (webhook đến trước) được dùng lại', async () => {
    await publish([], 'ext_page_2');
    const none = await admin.query(
      "SELECT 1 FROM cf.posts WHERE channel_id = $1 AND external_id = 'ext_page_2'",
      [fb],
    );
    expect(none.rows).toHaveLength(0);
    const pre = await admin.query(
      "INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ($1, $2, 'ext_page_3', 'từ webhook') RETURNING id",
      [ws, fb],
    );
    await publish([pA], 'ext_page_3');
    const links = await admin.query('SELECT product_id FROM cf.post_products WHERE post_id = $1', [
      pre.rows[0].id,
    ]);
    expect(links.rows.map((r) => r.product_id)).toEqual([pA]);
  });

  it('sản phẩm bị lưu trữ sau khi chọn → bỏ qua, việc ghi kết quả đăng vẫn thành công', async () => {
    const gone = await product(ws, 'Sắp lưu trữ');
    const id = await asOwner((tx) =>
      savePublishPost(tx, {
        message: 'y',
        channelIds: [fb],
        scheduledAt: SOON(),
        productIds: [gone, pA],
      }),
    );
    await admin.query("UPDATE cf.products SET status = 'archived' WHERE id = $1", [gone]);
    await dueNow(id);
    const target = (await asSystem((tx) => claimPublishTargets(tx, 50))).find(
      (c) => c.postId === id,
    );
    expect(
      await asSystem((tx) =>
        recordPublishResult(tx, target?.targetId as string, 'published', {
          externalPostId: 'ext_page_4',
        }),
      ),
    ).toBe(true);
    const links = await admin.query(
      "SELECT p.product_id FROM cf.post_products p JOIN cf.posts x ON x.id = p.post_id WHERE x.external_id = 'ext_page_4'",
    );
    expect(links.rows.map((r) => r.product_id)).toEqual([pA]);
  });

  it('hàm nội bộ liên kết không cấp cho cf_app/cf_worker (chỉ hàm ghi kết quả gọi được)', async () => {
    const grants = await admin.query(
      "SELECT has_function_privilege('cf_app', 'cf.link_published_post_products(uuid, text)', 'EXECUTE') AS app, has_function_privilege('cf_worker', 'cf.link_published_post_products(uuid, text)', 'EXECUTE') AS worker",
    );
    expect(grants.rows[0]).toEqual({ app: false, worker: false });
  });
});
