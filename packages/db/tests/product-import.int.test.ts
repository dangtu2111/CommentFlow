import { buildImportPlan, type ImportRecord } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { applyProductImport } from '../src/queries/product-import';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** KB-IMPORT-EXCEL (FR-051, Q-KBIX1): ghi hàng loạt qua withActor, upsert idempotent, khóa trường, chéo workspace. */
const RLS = '42501';

let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let owner: string;
let outsider: string;
let stranger: string;

// Fixture (không phải dữ liệu thật).
const rec = (over: Partial<ImportRecord>): ImportRecord => ({
  row: 2,
  productKey: 'ao thun',
  productName: 'Áo thun',
  productCode: null,
  category: null,
  url: null,
  sku: null,
  attrs: {},
  priceVnd: null,
  compareAtVnd: null,
  stock: null,
  ...over,
});
const records = [
  rec({ sku: 'AT-D-M', attrs: { Màu: 'Đen', Size: 'M' }, priceVnd: 150000, stock: 3 }),
  rec({ row: 3, sku: 'AT-T-M', attrs: { Màu: 'Trắng', Size: 'M' }, priceVnd: 160000, stock: 4 }),
  rec({ row: 4, productKey: 'quan', productName: 'Quần', priceVnd: 99000, stock: 1 }),
];

const productRows = (ws: string) =>
  admin.query(
    'SELECT id, name, price_vnd, stock, locked_fields, source, rev FROM cf.products WHERE workspace_id = $1 ORDER BY external_id',
    [ws],
  );

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin);
  outsider = await seedUser(admin);
  stranger = await seedUser(admin);
  await seedMember(admin, wsA, owner, 'owner');
  await seedMember(admin, wsB, outsider, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-051 ghi nhập Excel/CSV', () => {
  it('tạo sản phẩm + biến thể nguồn excel; chạy lại cùng file không nhân đôi (idempotent)', async () => {
    const plan = buildImportPlan(records);
    const first = await db.withActor(wsA, owner, (tx) => applyProductImport(tx, wsA, plan));
    expect(first).toEqual({
      productsCreated: 2,
      productsUpdated: 0,
      variantsCreated: 3,
      variantsUpdated: 0,
    });
    const again = await db.withActor(wsA, owner, (tx) => applyProductImport(tx, wsA, plan));
    expect(again).toEqual({
      productsCreated: 0,
      productsUpdated: 2,
      variantsCreated: 0,
      variantsUpdated: 3,
    });
    const rows = (await productRows(wsA)).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === 'excel')).toBe(true);
    const ao = rows.find((r) => r.name === 'Áo thun');
    expect(Number(ao?.price_vnd)).toBe(150000);
    expect(ao?.stock).toBe(7);
    const variants = await admin.query(
      'SELECT count(*)::int AS n FROM cf.product_variants WHERE workspace_id = $1',
      [wsA],
    );
    expect(variants.rows[0].n).toBe(3);
  });

  it('đổi giá trong file → cập nhật giá biến thể + sản phẩm, rev tăng', async () => {
    const before = Number((await productRows(wsA)).rows.find((r) => r.name === 'Quần')?.rev);
    const plan = buildImportPlan([
      rec({ row: 4, productKey: 'quan', productName: 'Quần', priceVnd: 120000, stock: 1 }),
    ]);
    await db.withActor(wsA, owner, (tx) => applyProductImport(tx, wsA, plan));
    const quan = (await productRows(wsA)).rows.find((r) => r.name === 'Quần');
    expect(Number(quan?.price_vnd)).toBe(120000);
    expect(Number(quan?.rev)).toBeGreaterThan(before);
  });

  it('trường trong locked_fields (tên, giá, tồn) không bị ghi đè, kể cả giá/tồn biến thể', async () => {
    await admin.query(
      `UPDATE cf.products SET locked_fields = ARRAY['name','price_vnd','stock'], name = 'Áo (đã sửa tay)'
       WHERE workspace_id = $1 AND external_id = 'ao thun'`,
      [wsA],
    );
    const plan = buildImportPlan([
      rec({ sku: 'AT-D-M', attrs: { Màu: 'Đen', Size: 'M' }, priceVnd: 1, stock: 99 }),
    ]);
    await db.withActor(wsA, owner, (tx) => applyProductImport(tx, wsA, plan));
    const ao = (await productRows(wsA)).rows.find((r) => r.name === 'Áo (đã sửa tay)');
    expect(Number(ao?.price_vnd)).toBe(150000);
    expect(ao?.stock).toBe(7);
    const variant = await admin.query(
      `SELECT price_vnd, stock FROM cf.product_variants WHERE workspace_id = $1 AND external_id = 'sku:AT-D-M'`,
      [wsA],
    );
    expect(Number(variant.rows[0].price_vnd)).toBe(150000);
    expect(variant.rows[0].stock).toBe(3);
  });

  it('workspace khác không thấy dữ liệu đã nhập; nhập vào B tạo hàng riêng của B', async () => {
    const seenFromB = await db.withActor(wsB, outsider, (tx) =>
      tx.execute(sql`SELECT id FROM cf.products WHERE source = 'excel'`),
    );
    expect(seenFromB.rows).toHaveLength(0);
    await db.withActor(wsB, outsider, (tx) =>
      applyProductImport(tx, wsB, buildImportPlan(records)),
    );
    expect((await productRows(wsB)).rows).toHaveLength(2);
    expect((await productRows(wsA)).rows).toHaveLength(2);
  });

  it('người không phải thành viên bị RLS chặn; lỗi giữa chừng không ghi dở (một giao dịch)', async () => {
    const plan = buildImportPlan([rec({ productKey: 'x', productName: 'X', priceVnd: 1 })]);
    expect(
      await expectRejectCode(
        db.withActor(wsA, stranger, (tx) => applyProductImport(tx, wsA, plan)),
      ),
    ).toBe(RLS);
    // Ghi vào workspace A trong ngữ cảnh B bị chặn.
    expect(
      await expectRejectCode(
        db.withActor(wsB, outsider, (tx) => applyProductImport(tx, wsA, plan)),
      ),
    ).toBe(RLS);
    const bad = buildImportPlan([
      rec({ productKey: 'ok', productName: 'OK' }),
      rec({ productKey: 'bad', productName: 'Bad', priceVnd: -1 }),
    ]);
    await expectRejectCode(db.withActor(wsA, owner, (tx) => applyProductImport(tx, wsA, bad)));
    const ok = await admin.query(
      `SELECT count(*)::int AS n FROM cf.products WHERE workspace_id = $1 AND external_id = 'ok'`,
      [wsA],
    );
    expect(ok.rows[0].n).toBe(0);
  });
});
