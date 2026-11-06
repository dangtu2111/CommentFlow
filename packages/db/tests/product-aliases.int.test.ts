import { normalizeSearchText, parseProductAlias } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { findProductMatch } from '../src/queries/kb-search';
import {
  createProductAlias,
  deleteProductAlias,
  listProductAliases,
  searchProductsByAlias,
} from '../src/queries/product-aliases';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * PRODUCT-ALIAS (FR-128, US-100, Q-PA1): RLS chéo workspace, Owner và Staff cùng ghi, confirmed_by không giả được,
 * tìm khớp theo bí danh (ngưỡng 0,6, mơ hồ, chỉ sản phẩm active), findProductMatch thử bí danh trước.
 */
const RLS = '42501';
const UNIQUE = '23505';
const FK = '23503';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let stranger: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

const alias = (text: string, source = 'staff') => {
  const r = parseProductAlias({ alias: text, source });
  expect(r.success).toBe(true);
  return (r as { data: Parameters<typeof createProductAlias>[3] }).data;
};

async function seedProduct(workspace: string, name: string, status = 'active') {
  const r = await admin.query(
    'INSERT INTO cf.products (workspace_id, name, status, search_text) VALUES ($1, $2, $3, $4) RETURNING id',
    [workspace, name, status, normalizeSearchText(name)],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
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
  await db.close();
  await admin.end();
});

describe('FR-128 ghi bí danh + RLS', () => {
  it('Owner và Staff thêm, liệt kê, xóa; trùng (alias_norm, sản phẩm) → 23505', async () => {
    const product = await seedProduct(ws, 'Váy hoa nhí');
    const byOwner = await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, product, alias('Mẫu Hồng'), owner),
    );
    const byStaff = await db.withActor(ws, staff, (tx) =>
      createProductAlias(tx, ws, product, alias('set đi biển')),
    );
    const list = await db.withActor(ws, staff, (tx) => listProductAliases(tx, ws, product));
    expect(list.map((a) => a.alias).sort()).toEqual(['Mẫu Hồng', 'set đi biển']);
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => createProductAlias(tx, ws, product, alias('MAU HONG'))),
      UNIQUE,
    );
    expect(await db.withActor(ws, staff, (tx) => deleteProductAlias(tx, ws, byOwner))).toBe(true);
    expect(await db.withActor(ws, staff, (tx) => deleteProductAlias(tx, ws, byStaff))).toBe(true);
    expect(await db.withActor(ws, staff, (tx) => deleteProductAlias(tx, ws, byStaff))).toBe(false);
  });

  it('workspace khác không thấy, không xóa, không ghi cho sản phẩm của workspace này', async () => {
    const product = await seedProduct(ws, 'Áo len cổ lọ');
    const id = await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, product, alias('len cổ lọ')),
    );
    expect(
      await db.withActor(other, otherOwner, (tx) => listProductAliases(tx, other, product)),
    ).toEqual([]);
    expect(await db.withActor(other, otherOwner, (tx) => deleteProductAlias(tx, other, id))).toBe(
      false,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        createProductAlias(tx, other, product, alias('len cổ lọ')),
      ),
      FK,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        createProductAlias(tx, ws, product, alias('chui vao')),
      ),
      RLS,
    );
  });

  it('người ngoài workspace (không là thành viên) không đọc/ghi được', async () => {
    const product = await seedProduct(ws, 'Quần ống rộng');
    await expectRejectCode(
      db.withActor(ws, stranger, (tx) => createProductAlias(tx, ws, product, alias('ống rộng'))),
      RLS,
    );
  });

  it('confirmed_by không giả được người khác; ai_suggested bắt buộc có người xác nhận', async () => {
    const product = await seedProduct(ws, 'Đầm xòe');
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => createProductAlias(tx, ws, product, alias('xòe'), owner)),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        createProductAlias(tx, ws, product, alias('xòe xinh', 'ai_suggested')),
      ),
      RLS,
    );
    const id = await db.withActor(ws, staff, (tx) =>
      createProductAlias(tx, ws, product, alias('xòe xinh', 'ai_suggested'), staff),
    );
    const [row] = await db.withActor(ws, staff, (tx) => listProductAliases(tx, ws, product));
    expect(row).toMatchObject({ id, source: 'ai_suggested', confirmedBy: staff });
  });

  it('cf_app không UPDATE được bí danh', async () => {
    const product = await seedProduct(ws, 'Giày thể thao');
    const id = await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, product, alias('giày chạy')),
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(sql`UPDATE cf.product_aliases SET alias = 'x' WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
  });
});

describe('US-100 tìm khớp theo bí danh', () => {
  it('"ao hong" khớp bí danh "Mẫu hồng"; dưới ngưỡng thì không trả; archived và workspace khác không trả', async () => {
    const a = await seedProduct(ws, 'Váy A1');
    const archived = await seedProduct(ws, 'Váy A2', 'archived');
    const foreign = await seedProduct(other, 'Váy A3');
    await db.withActor(ws, owner, (tx) => createProductAlias(tx, ws, a, alias('Mẫu hồng pastel')));
    await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, archived, alias('Mẫu hồng pastel')),
    );
    await db.withActor(other, otherOwner, (tx) =>
      createProductAlias(tx, other, foreign, alias('Mẫu hồng pastel')),
    );
    const hits = await db.withActor(ws, staff, (tx) =>
      searchProductsByAlias(tx, { workspaceId: ws, queryText: 'mau hong pastel' }),
    );
    expect(hits.map((h) => h.id)).toEqual([a]);
    expect(hits[0]?.similarity).toBeGreaterThanOrEqual(0.6);
    const none = await db.withActor(ws, staff, (tx) =>
      searchProductsByAlias(tx, { workspaceId: ws, queryText: 'xe may' }),
    );
    expect(none).toEqual([]);
  });

  it('findProductMatch: bí danh đủ tin cậy → matched; hai sản phẩm cùng bí danh → ambiguous', async () => {
    const p1 = await seedProduct(ws, 'Sản phẩm Một');
    const p2 = await seedProduct(ws, 'Sản phẩm Hai');
    const p3 = await seedProduct(ws, 'Sản phẩm Ba');
    await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, p1, alias('combo mùa hè xanh')),
    );
    await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, p2, alias('bộ đồ nhà kẻ sọc')),
    );
    await db.withActor(ws, owner, (tx) =>
      createProductAlias(tx, ws, p3, alias('bộ đồ nhà kẻ sọc')),
    );
    const matched = await db.withActor(ws, staff, (tx) =>
      findProductMatch(tx, { workspaceId: ws, queryText: 'combo mua he xanh' }),
    );
    expect(matched).toMatchObject({ status: 'matched', id: p1 });
    const ambiguous = await db.withActor(ws, staff, (tx) =>
      findProductMatch(tx, { workspaceId: ws, queryText: 'bo do nha ke soc' }),
    );
    expect(ambiguous.status).toBe('ambiguous');
    if (ambiguous.status === 'ambiguous') expect(ambiguous.ids.sort()).toEqual([p2, p3].sort());
  });

  it('không có bí danh → findProductMatch vẫn rơi về tên/SKU như cũ', async () => {
    const p = await seedProduct(ws, 'Khăn lụa Hermesque');
    const m = await db.withActor(ws, staff, (tx) =>
      findProductMatch(tx, { workspaceId: ws, queryText: 'khan lua hermesque' }),
    );
    expect(m).toMatchObject({ status: 'matched', id: p });
  });
});
