import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listCatalogProducts } from '../src/queries/catalog-list';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** KB-CATALOG: danh sách sản phẩm cho trang Danh mục (chỉ đọc): lọc nguồn/tìm kiếm/trạng thái, phân trang, đếm theo nguồn, đúng workspace. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let otherOwner: string;

const insert = (
  workspace: string,
  name: string,
  source: string,
  extra: { sku?: string; price?: number; stock?: number; status?: string } = {},
) =>
  admin.query(
    `INSERT INTO cf.products (workspace_id, name, source, sku, price_vnd, stock, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      workspace,
      name,
      source,
      extra.sku ?? null,
      extra.price ?? null,
      extra.stock ?? null,
      extra.status ?? 'active',
    ],
  );

const list = (opts: Parameters<typeof listCatalogProducts>[2] = {}) =>
  db.withActor(ws, owner, (tx) => listCatalogProducts(tx, ws, opts));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'cat-owner');
  otherOwner = await seedUser(admin, 'cat-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, other, otherOwner, 'owner');
  await insert(ws, 'Áo thun cotton', 'shopify', { sku: 'AT-01', price: 199000, stock: 6 });
  await insert(ws, 'Đầm xòe linen', 'shopify', { sku: 'DR-04', price: 299000, stock: 42 });
  await insert(ws, 'Quần jean ống suông', 'excel', { sku: 'JN-09', price: 380000, stock: 0 });
  await insert(ws, '100% cotton_tee', 'manual', { sku: 'X_1' });
  await insert(ws, 'Áo cũ ngừng bán', 'shopify', { status: 'archived' });
  await insert(other, 'Sản phẩm shop khác', 'manual');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('listCatalogProducts', () => {
  it('mặc định: chỉ sản phẩm đang hoạt động của workspace, mới cập nhật trước; đếm theo nguồn và tổng', async () => {
    const r = await list();
    expect(r.total).toBe(4);
    expect(r.rows).toHaveLength(4);
    expect(r.bySource).toEqual({ shopify: 2, excel: 1, manual: 1 });
    expect(r.rows.map((p) => p.name)).not.toContain('Sản phẩm shop khác');
    expect(r.rows.map((p) => p.name)).not.toContain('Áo cũ ngừng bán');
    expect(r.rows.find((p) => p.sku === 'DR-04')).toMatchObject({
      name: 'Đầm xòe linen',
      source: 'shopify',
      priceVnd: 299000,
      stock: 42,
      currencyCode: 'VND',
      variantCount: 0,
    });
  });

  it('lọc theo nguồn; số đếm theo nguồn KHÔNG đổi theo bộ lọc nguồn nhưng theo tìm kiếm', async () => {
    const r = await list({ source: 'shopify' });
    expect(r.rows.map((p) => p.sku).sort()).toEqual(['AT-01', 'DR-04']);
    expect(r.total).toBe(2);
    expect(r.bySource).toEqual({ shopify: 2, excel: 1, manual: 1 });
    const q = await list({ query: 'cotton' });
    expect(q.bySource).toEqual({ shopify: 1, manual: 1 });
  });

  it('tìm theo tên hoặc SKU, không phân biệt hoa thường; ký tự % _ được coi là chữ thường', async () => {
    expect((await list({ query: 'LINEN' })).rows.map((p) => p.sku)).toEqual(['DR-04']);
    expect((await list({ query: 'jn-09' })).rows.map((p) => p.name)).toEqual([
      'Quần jean ống suông',
    ]);
    expect((await list({ query: '100%' })).rows.map((p) => p.sku)).toEqual(['X_1']);
    expect((await list({ query: '%' })).rows).toHaveLength(1);
    expect((await list({ query: '_' })).rows).toHaveLength(1);
    expect((await list({ query: 'không có đâu' })).rows).toEqual([]);
  });

  it('trạng thái ngừng bán; phân trang theo trang/cỡ trang, tổng không đổi', async () => {
    expect((await list({ status: 'archived' })).rows.map((p) => p.name)).toEqual([
      'Áo cũ ngừng bán',
    ]);
    const p1 = await list({ page: 1, pageSize: 3 });
    const p2 = await list({ page: 2, pageSize: 3 });
    expect(p1.rows).toHaveLength(3);
    expect(p2.rows).toHaveLength(1);
    expect(p1.total).toBe(4);
    expect(new Set([...p1.rows, ...p2.rows].map((p) => p.id)).size).toBe(4);
  });

  it('workspace khác chỉ thấy sản phẩm của mình', async () => {
    const r = await db.withActor(other, otherOwner, (tx) => listCatalogProducts(tx, other, {}));
    expect(r.rows.map((p) => p.name)).toEqual(['Sản phẩm shop khác']);
    expect(r.bySource).toEqual({ manual: 1 });
  });
});
