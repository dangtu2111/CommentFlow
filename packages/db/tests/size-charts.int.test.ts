import { normalizeSearchText, parseSizeChartRow } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createSizeChartRow,
  deleteSizeChartRow,
  findSizeChartRows,
  listSizeChartRows,
  lookupSize,
  updateSizeChartRow,
} from '../src/queries/size-charts';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * SIZE-TABLE (FR-149, US-102, Q-ST1): RLS chéo workspace, chỉ Owner ghi (Staff chỉ đọc), ràng buộc dữ liệu,
 * chọn bảng (sản phẩm thắng danh mục) và tra size end-to-end qua decideSize.
 */
const RLS = '42501';
const UNIQUE = '23505';
const FK = '23503';
const CHECK = '23514';

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

const row = (o: Record<string, unknown>) => {
  const r = parseSizeChartRow(o);
  expect(r.success).toBe(true);
  return (r as { data: Parameters<typeof createSizeChartRow>[2] }).data;
};

async function seedProduct(workspace: string, name: string, category: string | null = null) {
  const r = await admin.query(
    'INSERT INTO cf.products (workspace_id, name, status, category, search_text) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [workspace, name, 'active', category, normalizeSearchText(name)],
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

describe('FR-149 ghi bảng size + RLS', () => {
  it('Owner thêm/sửa/liệt kê/xóa; số thập phân về đúng kiểu số; trùng size cùng phạm vi → 23505', async () => {
    const product = await seedProduct(ws, 'Váy bảng size A');
    const id = await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(
        tx,
        ws,
        row({
          productId: product,
          size: 'm',
          heightMinCm: 158,
          heightMaxCm: 165.5,
          weightMaxKg: 57,
        }),
      ),
    );
    const [r] = await db.withActor(ws, owner, (tx) =>
      listSizeChartRows(tx, ws, { productId: product }),
    );
    expect(r).toMatchObject({
      id,
      size: 'M',
      heightMinCm: 158,
      heightMaxCm: 165.5,
      weightMinKg: null,
      weightMaxKg: 57,
    });
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        createSizeChartRow(tx, ws, row({ productId: product, size: 'M', heightMinCm: 100 })),
      ),
      UNIQUE,
    );
    expect(
      await db.withActor(ws, owner, (tx) =>
        updateSizeChartRow(
          tx,
          ws,
          id,
          row({ productId: product, size: 'M', heightMinCm: 160, heightMaxCm: 166, note: 'ôm' }),
        ),
      ),
    ).toBe(true);
    const [after] = await db.withActor(ws, owner, (tx) =>
      listSizeChartRows(tx, ws, { productId: product }),
    );
    expect(after).toMatchObject({ heightMinCm: 160, weightMaxKg: null, note: 'ôm' });
    expect(await db.withActor(ws, owner, (tx) => deleteSizeChartRow(tx, ws, id))).toBe(true);
    expect(await db.withActor(ws, owner, (tx) => deleteSizeChartRow(tx, ws, id))).toBe(false);
  });

  it('bảng theo danh mục: liệt kê theo danh mục (không dấu, hoa thường), trùng size cùng danh mục → 23505', async () => {
    await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(tx, ws, row({ category: 'Áo Thun', size: 'S', heightMaxCm: 160 })),
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        createSizeChartRow(tx, ws, row({ category: 'ao  thun', size: 'S', heightMaxCm: 150 })),
      ),
      UNIQUE,
    );
    const list = await db.withActor(ws, staff, (tx) =>
      listSizeChartRows(tx, ws, { category: 'ÁO THUN' }),
    );
    expect(list.map((x) => x.size)).toEqual(['S']);
  });

  it('Staff đọc được nhưng không thêm/sửa/xóa (RLS); người ngoài workspace không đọc, không ghi', async () => {
    const product = await seedProduct(ws, 'Váy bảng size B');
    const id = await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(tx, ws, row({ productId: product, size: 'L', weightMinKg: 60 })),
    );
    const seen = await db.withActor(ws, staff, (tx) =>
      listSizeChartRows(tx, ws, { productId: product }),
    );
    expect(seen).toHaveLength(1);
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        createSizeChartRow(tx, ws, row({ productId: product, size: 'XL', weightMinKg: 70 })),
      ),
      RLS,
    );
    expect(await db.withActor(ws, staff, (tx) => deleteSizeChartRow(tx, ws, id))).toBe(false);
    expect(
      await db.withActor(ws, staff, (tx) =>
        updateSizeChartRow(tx, ws, id, row({ productId: product, size: 'L', weightMinKg: 1 })),
      ),
    ).toBe(false);
    expect(
      await db.withActor(ws, stranger, (tx) => listSizeChartRows(tx, ws, { productId: product })),
    ).toEqual([]);
    await expectRejectCode(
      db.withActor(ws, stranger, (tx) =>
        createSizeChartRow(tx, ws, row({ productId: product, size: 'XL', weightMinKg: 70 })),
      ),
      RLS,
    );
    const stillThere = await db.withActor(ws, owner, (tx) =>
      listSizeChartRows(tx, ws, { productId: product }),
    );
    expect(stillThere[0]).toMatchObject({ id, weightMinKg: 60 });
  });

  it('workspace khác không thấy/sửa/xóa, không ghi cho sản phẩm của workspace này', async () => {
    const product = await seedProduct(ws, 'Váy bảng size C');
    const id = await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(tx, ws, row({ productId: product, size: 'M', heightMinCm: 150 })),
    );
    expect(
      await db.withActor(other, otherOwner, (tx) =>
        listSizeChartRows(tx, other, { productId: product }),
      ),
    ).toEqual([]);
    expect(await db.withActor(other, otherOwner, (tx) => deleteSizeChartRow(tx, other, id))).toBe(
      false,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        createSizeChartRow(tx, other, row({ productId: product, size: 'M', heightMinCm: 150 })),
      ),
      FK,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        createSizeChartRow(tx, ws, row({ productId: product, size: 'S', heightMinCm: 150 })),
      ),
      RLS,
    );
  });

  it('cf_app không đổi được phạm vi (product_id) của dòng đã tạo', async () => {
    const p1 = await seedProduct(ws, 'Váy bảng size D1');
    const p2 = await seedProduct(ws, 'Váy bảng size D2');
    const id = await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(tx, ws, row({ productId: p1, size: 'M', heightMinCm: 150 })),
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        tx.execute(sql`UPDATE cf.size_charts SET product_id = ${p2}::uuid WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
  });

  it('CHECK ở DB: không cả sản phẩm lẫn danh mục, không khoảng nào, min > max (đi vòng qua parse)', async () => {
    const product = await seedProduct(ws, 'Váy bảng size E');
    const insert = (cols: string, vals: unknown[]) =>
      admin.query(
        `INSERT INTO cf.size_charts (workspace_id, ${cols}) VALUES ($1, ${vals.map((_, i) => `$${i + 2}`).join(', ')})`,
        [ws, ...vals],
      );
    await expect(
      insert('product_id, category, category_norm, size, height_min_cm', [
        product,
        'Áo',
        'ao',
        'M',
        150,
      ]),
    ).rejects.toMatchObject({ code: CHECK });
    await expect(insert('size', ['M'])).rejects.toMatchObject({ code: CHECK });
    await expect(
      insert('product_id, size, height_min_cm, height_max_cm', [product, 'M', 170, 160]),
    ).rejects.toMatchObject({ code: CHECK });
    await expect(
      insert('product_id, size, weight_min_kg', [product, 'M', 0]),
    ).rejects.toMatchObject({
      code: CHECK,
    });
  });

  it('xóa sản phẩm thì xóa bảng size của nó', async () => {
    const product = await seedProduct(ws, 'Váy bảng size F');
    await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(tx, ws, row({ productId: product, size: 'M', heightMinCm: 150 })),
    );
    await admin.query('DELETE FROM cf.products WHERE id = $1', [product]);
    const left = await admin.query('SELECT 1 FROM cf.size_charts WHERE product_id = $1', [product]);
    expect(left.rowCount).toBe(0);
  });
});

describe('US-102 tra size', () => {
  async function seedChart(
    product: string,
    sizes: Array<[string, number, number, number, number]>,
  ) {
    for (const [size, hMin, hMax, wMin, wMax] of sizes) {
      await db.withActor(ws, owner, (tx) =>
        createSizeChartRow(
          tx,
          ws,
          row({
            productId: product,
            size,
            heightMinCm: hMin,
            heightMaxCm: hMax,
            weightMinKg: wMin,
            weightMaxKg: wMax,
          }),
        ),
      );
    }
  }

  it('"cao 1m6 nặng 55kg" → size M; thiếu số đo → hỏi lại; giữa hai size / ngoài bảng → mời ib', async () => {
    const product = await seedProduct(ws, 'Đầm tra size');
    await seedChart(product, [
      ['S', 150, 157, 40, 49],
      ['M', 158, 165, 50, 57],
      ['L', 164, 170, 56, 65],
    ]);
    const ask = (input: Record<string, number | undefined>) =>
      db.withActor(ws, staff, (tx) =>
        lookupSize(tx, { workspaceId: ws, productId: product, ...input }),
      );
    expect(await ask({ heightCm: 160, weightKg: 55 })).toMatchObject({
      kind: 'size',
      size: 'M',
      scope: 'product',
    });
    expect(await ask({ heightCm: 160 })).toMatchObject({ kind: 'ask', missing: ['weight'] });
    expect(await ask({ heightCm: 164, weightKg: 56 })).toMatchObject({
      kind: 'handoff',
      reason: 'between_sizes',
      sizes: ['M', 'L'],
    });
    expect(await ask({ heightCm: 190, weightKg: 90 })).toMatchObject({
      kind: 'handoff',
      reason: 'out_of_range',
    });
  });

  it('bảng riêng của sản phẩm thắng bảng danh mục; sản phẩm không có bảng riêng dùng bảng danh mục', async () => {
    const withOwn = await seedProduct(ws, 'Áo có bảng riêng', 'Áo Khoác');
    const noOwn = await seedProduct(ws, 'Áo dùng bảng danh mục', 'áo khoác');
    await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(
        tx,
        ws,
        row({ category: 'Áo khoác', size: 'M', heightMinCm: 150, heightMaxCm: 170 }),
      ),
    );
    await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(
        tx,
        ws,
        row({ productId: withOwn, size: 'XL', heightMinCm: 150, heightMaxCm: 170 }),
      ),
    );
    const own = await db.withActor(ws, staff, (tx) =>
      findSizeChartRows(tx, { workspaceId: ws, productId: withOwn, category: 'Áo Khoác' }),
    );
    expect(own.scope).toBe('product');
    expect(own.rows.map((r) => r.size)).toEqual(['XL']);
    const byCategory = await db.withActor(ws, staff, (tx) =>
      lookupSize(tx, { workspaceId: ws, productId: noOwn, category: 'áo khoác', heightCm: 160 }),
    );
    expect(byCategory).toMatchObject({ kind: 'size', size: 'M', scope: 'category' });
  });

  it('không có bảng nào → mời ib + ghi khoảng trống (recordGap); workspace khác không thấy bảng của shop này', async () => {
    const mine = await seedProduct(ws, 'Quần có bảng', 'Quần Tây');
    await db.withActor(ws, owner, (tx) =>
      createSizeChartRow(tx, ws, row({ productId: mine, size: 'M', heightMinCm: 150 })),
    );
    const foreign = await seedProduct(other, 'Quần xưởng khác', 'Quần Tây');
    const r = await db.withActor(other, otherOwner, (tx) =>
      lookupSize(tx, {
        workspaceId: other,
        productId: foreign,
        category: 'Quần Tây',
        heightCm: 160,
      }),
    );
    expect(r).toEqual({
      kind: 'handoff',
      reason: 'no_chart',
      sizes: [],
      recordGap: true,
      scope: 'none',
    });
  });
});
