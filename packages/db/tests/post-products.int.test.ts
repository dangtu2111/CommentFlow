import { randomUUID } from 'node:crypto';
import { normalizeSearchText, parseLinkPostProducts } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  confirmSuggestedPostProduct,
  linkProductsToPosts,
  listPostProducts,
  productIdsForAnswering,
  setPrimaryPostProduct,
  suggestPostProducts,
  unlinkPostProduct,
} from '../src/queries/post-products';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * POSTS-LINK-PRODUCT (FR-061, US-032, Q-PLP1): nhiều sản phẩm/bài, tối đa một chính, gắn hàng loạt, đề xuất AI
 * cần xác nhận (hệ thống không tự tạo `confirmed`), RLS chéo workspace.
 */
const RLS = '42501';
const FK = '23503';
const UNIQUE = '23505';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let stranger: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

const bulk = (postIds: string[], productIds: string[], primaryProductId?: string) => {
  const r = parseLinkPostProducts({ postIds, productIds, primaryProductId });
  expect(r.success).toBe(true);
  return (r as { data: Parameters<typeof linkProductsToPosts>[3] }).data;
};

async function seedPost(workspace: string): Promise<string> {
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [workspace, `pp-${randomUUID()}`],
  );
  const r = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [workspace, ch.rows[0].id, `post-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

async function seedProduct(workspace: string, name: string): Promise<string> {
  const r = await admin.query(
    'INSERT INTO cf.products (workspace_id, name, search_text) VALUES ($1, $2, $3) RETURNING id',
    [workspace, name, normalizeSearchText(name)],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  worker = createWorkerDb(2);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  staff = await seedUser(admin, 'staff');
  otherOwner = await seedUser(admin, 'otherOwner');
  stranger = await seedUser(admin, 'stranger');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await worker.close();
  await db.close();
  await admin.end();
});

describe('FR-061 gắn nhiều sản phẩm + sản phẩm chính', () => {
  it('gắn hai sản phẩm, đặt chính, đổi chính; chỉ một chính mỗi bài', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Áo A');
    const b = await seedProduct(ws, 'Áo B');
    const n = await db.withActor(ws, staff, (tx) =>
      linkProductsToPosts(tx, ws, staff, bulk([post], [a, b], a)),
    );
    expect(n).toBe(2);
    let rows = await db.withActor(ws, staff, (tx) => listPostProducts(tx, ws, post));
    expect(rows.map((r) => [r.productId, r.isPrimary])).toEqual([
      [a, true],
      [b, false],
    ]);
    expect(await db.withActor(ws, staff, (tx) => setPrimaryPostProduct(tx, ws, post, b))).toBe(
      true,
    );
    rows = await db.withActor(ws, staff, (tx) => listPostProducts(tx, ws, post));
    expect(rows.filter((r) => r.isPrimary).map((r) => r.productId)).toEqual([b]);
    expect(await db.withActor(ws, staff, (tx) => productIdsForAnswering(tx, ws, post))).toEqual([
      b,
      a,
    ]);
  });

  it('DB chặn hai sản phẩm chính cùng bài (chỉ mục duy nhất từng phần)', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Váy A');
    const b = await seedProduct(ws, 'Váy B');
    await db.withActor(ws, staff, (tx) =>
      linkProductsToPosts(tx, ws, staff, bulk([post], [a, b], a)),
    );
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        tx.execute(
          sql`UPDATE cf.post_products SET is_primary = true WHERE post_id = ${post}::uuid AND product_id = ${b}::uuid`,
        ),
      ),
      UNIQUE,
    );
  });

  it('setPrimaryPostProduct: sản phẩm chưa gắn → false, không đổi gì', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Quần A');
    const loose = await seedProduct(ws, 'Quần lạ');
    await db.withActor(ws, staff, (tx) => linkProductsToPosts(tx, ws, staff, bulk([post], [a], a)));
    expect(await db.withActor(ws, staff, (tx) => setPrimaryPostProduct(tx, ws, post, loose))).toBe(
      false,
    );
    const rows = await db.withActor(ws, staff, (tx) => listPostProducts(tx, ws, post));
    expect(rows.map((r) => r.productId)).toEqual([a]);
    expect(rows[0]?.isPrimary).toBe(true);
  });

  it('gỡ liên kết; gỡ lần hai → false', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Giày A');
    await db.withActor(ws, staff, (tx) => linkProductsToPosts(tx, ws, staff, bulk([post], [a])));
    expect(await db.withActor(ws, staff, (tx) => unlinkPostProduct(tx, ws, post, a))).toBe(true);
    expect(await db.withActor(ws, staff, (tx) => unlinkPostProduct(tx, ws, post, a))).toBe(false);
  });
});

describe('FR-061 gắn hàng loạt', () => {
  it('3 bài × 2 sản phẩm = 6 cặp; chạy lại không trùng; chính chỉ đặt cho bài chưa có chính', async () => {
    const posts = [await seedPost(ws), await seedPost(ws), await seedPost(ws)];
    const a = await seedProduct(ws, 'Set A');
    const b = await seedProduct(ws, 'Set B');
    // bài đầu đã có chính = b
    await db.withActor(ws, owner, (tx) =>
      linkProductsToPosts(tx, ws, owner, bulk([posts[0] as string], [b], b)),
    );
    const n = await db.withActor(ws, owner, (tx) =>
      linkProductsToPosts(tx, ws, owner, bulk(posts, [a, b], a)),
    );
    expect(n).toBe(5); // 6 cặp, trừ cặp (bài 0, b) đã có
    expect(
      await db.withActor(ws, owner, (tx) =>
        linkProductsToPosts(tx, ws, owner, bulk(posts, [a, b], a)),
      ),
    ).toBe(0);
    const first = await db.withActor(ws, owner, (tx) =>
      listPostProducts(tx, ws, posts[0] as string),
    );
    expect(first.find((r) => r.isPrimary)?.productId).toBe(b); // không bị đè
    const second = await db.withActor(ws, owner, (tx) =>
      listPostProducts(tx, ws, posts[1] as string),
    );
    expect(second.find((r) => r.isPrimary)?.productId).toBe(a);
  });

  it('một bài/sản phẩm thuộc workspace khác → cả lô bị từ chối (23503), không ghi dở', async () => {
    const mine = await seedPost(ws);
    const foreign = await seedPost(other);
    const a = await seedProduct(ws, 'Phụ kiện A');
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        linkProductsToPosts(tx, ws, staff, bulk([mine, foreign], [a])),
      ),
      FK,
    );
    expect(await db.withActor(ws, staff, (tx) => listPostProducts(tx, ws, mine))).toEqual([]);
  });
});

describe('US-032 đề xuất của AI cần xác nhận', () => {
  it('worker đề xuất → chưa dùng để trả lời; nhân viên xác nhận → dùng được, ghi tên người xác nhận', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Đầm A');
    expect(await worker.withJob(ws, (tx) => suggestPostProducts(tx, ws, post, [a]))).toBe(1);
    expect(await worker.withJob(ws, (tx) => suggestPostProducts(tx, ws, post, [a]))).toBe(0);
    expect(await db.withActor(ws, staff, (tx) => productIdsForAnswering(tx, ws, post))).toEqual([]);
    expect(
      await db.withActor(ws, staff, (tx) => confirmSuggestedPostProduct(tx, ws, staff, post, a)),
    ).toBe(true);
    expect(await db.withActor(ws, staff, (tx) => productIdsForAnswering(tx, ws, post))).toEqual([
      a,
    ]);
    const [row] = await db.withActor(ws, staff, (tx) => listPostProducts(tx, ws, post));
    expect(row).toMatchObject({ status: 'confirmed', suggestedByAi: true, confirmedBy: staff });
    expect(
      await db.withActor(ws, staff, (tx) => confirmSuggestedPostProduct(tx, ws, staff, post, a)),
    ).toBe(false);
  });

  it('gắn hàng loạt nâng đề xuất lên đã xác nhận (giữ nguồn AI)', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Túi A');
    await worker.withJob(ws, (tx) => suggestPostProducts(tx, ws, post, [a]));
    expect(
      await db.withActor(ws, staff, (tx) =>
        linkProductsToPosts(tx, ws, staff, bulk([post], [a], a)),
      ),
    ).toBe(1);
    const [row] = await db.withActor(ws, staff, (tx) => listPostProducts(tx, ws, post));
    expect(row).toMatchObject({ status: 'confirmed', suggestedByAi: true, isPrimary: true });
  });

  it('hệ thống/AI KHÔNG tạo được liên kết đã xác nhận; không đặt chính cho đề xuất', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Mũ A');
    await expectRejectCode(
      worker.withJob(ws, (tx) =>
        tx.execute(sql`INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, confirmed_by)
          VALUES (${ws}::uuid, ${post}::uuid, ${a}::uuid, 'confirmed', ${staff}::uuid)`),
      ),
      RLS,
    );
    await expectRejectCode(
      worker.withJob(ws, (tx) =>
        tx.execute(sql`INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, suggested_by_ai, is_primary)
          VALUES (${ws}::uuid, ${post}::uuid, ${a}::uuid, 'suggested', true, true)`),
      ),
      CHECK,
    );
  });

  it('kết nối worker không tạo confirmed dù giả người dùng (withActor), và không xóa được liên kết confirmed', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Nón A');
    await expectRejectCode(
      worker.withActor(ws, staff, (tx) =>
        tx.execute(sql`INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, confirmed_by)
          VALUES (${ws}::uuid, ${post}::uuid, ${a}::uuid, 'confirmed', ${staff}::uuid)`),
      ),
      RLS,
    );
    await db.withActor(ws, staff, (tx) => linkProductsToPosts(tx, ws, staff, bulk([post], [a])));
    expect(await worker.withJob(ws, (tx) => unlinkPostProduct(tx, ws, post, a))).toBe(false);
    expect(await db.withActor(ws, staff, (tx) => productIdsForAnswering(tx, ws, post))).toEqual([
      a,
    ]);
  });

  it('confirmed_by không giả được người khác', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Kính A');
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        tx.execute(sql`INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, confirmed_by)
          VALUES (${ws}::uuid, ${post}::uuid, ${a}::uuid, 'confirmed', ${owner}::uuid)`),
      ),
      RLS,
    );
  });

  it('không UPDATE được trạng thái/người xác nhận (chỉ is_primary)', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Khăn A');
    await worker.withJob(ws, (tx) => suggestPostProducts(tx, ws, post, [a]));
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        tx.execute(
          sql`UPDATE cf.post_products SET status = 'confirmed' WHERE post_id = ${post}::uuid`,
        ),
      ),
      RLS,
    );
  });
});

describe('FR-061 RLS chéo workspace', () => {
  it('workspace khác không thấy, không gỡ, không ghi vào bài của workspace này; người ngoài bị chặn', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Bộ A');
    await db.withActor(ws, owner, (tx) => linkProductsToPosts(tx, ws, owner, bulk([post], [a], a)));
    expect(
      await db.withActor(other, otherOwner, (tx) => listPostProducts(tx, other, post)),
    ).toEqual([]);
    expect(
      await db.withActor(other, otherOwner, (tx) => unlinkPostProduct(tx, other, post, a)),
    ).toBe(false);
    expect(
      await db.withActor(other, otherOwner, (tx) => productIdsForAnswering(tx, other, post)),
    ).toEqual([]);
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        linkProductsToPosts(tx, ws, otherOwner, bulk([post], [a])),
      ),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, stranger, (tx) => linkProductsToPosts(tx, ws, stranger, bulk([post], [a]))),
      RLS,
    );
    expect(await db.withActor(ws, owner, (tx) => listPostProducts(tx, ws, post))).toHaveLength(1);
  });

  it('xóa bài hoặc sản phẩm thì xóa liên kết (cascade)', async () => {
    const post = await seedPost(ws);
    const a = await seedProduct(ws, 'Ví A');
    await db.withActor(ws, owner, (tx) => linkProductsToPosts(tx, ws, owner, bulk([post], [a])));
    await admin.query('DELETE FROM cf.products WHERE id = $1', [a]);
    expect(await db.withActor(ws, owner, (tx) => listPostProducts(tx, ws, post))).toEqual([]);
  });
});
