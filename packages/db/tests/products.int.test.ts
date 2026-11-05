import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { findActiveVariants } from '../src/queries/products';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  newId,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** PRODUCTS-VARIANTS (FR-129, FR-056, FR-058): RLS chéo workspace, vai trò ghi, products.rev, truy vấn biến thể. */
const RLS = '42501';
const FK = '23503';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let owner: string;
let staff: string;
let stranger: string;
let outsider: string; // thành viên của B, không phải của A

const exec = (workspace: string, user: string, text: string, params: unknown[] = []) =>
  db.withActor(workspace, user, (tx) =>
    tx.execute(sql.raw(text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1])))),
  );
const lit = (value: unknown): string =>
  value === null || value === undefined
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replace(/'/g, "''")}'`;

async function seedProduct(workspace: string, name = 'Áo thun', price = 100000, stock = 5) {
  const r = await admin.query(
    'INSERT INTO cf.products (workspace_id, name, price_vnd, stock) VALUES ($1, $2, $3, $4) RETURNING id',
    [workspace, name, price, stock],
  );
  return r.rows[0].id as string;
}
async function seedVariant(
  workspace: string,
  product: string,
  attrsNorm: Record<string, string>,
  price = 100000,
  stock = 3,
  status = 'active',
) {
  const r = await admin.query(
    `INSERT INTO cf.product_variants (workspace_id, product_id, attrs, attrs_norm, price_vnd, stock, status)
     VALUES ($1, $2, $3, $3, $4, $5, $6) RETURNING id`,
    [workspace, product, JSON.stringify(attrsNorm), price, stock, status],
  );
  return r.rows[0].id as string;
}
const revOf = async (product: string) =>
  Number((await admin.query('SELECT rev FROM cf.products WHERE id = $1', [product])).rows[0].rev);

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin);
  staff = await seedUser(admin);
  stranger = await seedUser(admin);
  outsider = await seedUser(admin);
  await seedMember(admin, wsA, owner, 'owner');
  await seedMember(admin, wsA, staff, 'staff');
  await seedMember(admin, wsB, outsider, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-129 RLS: products + product_variants', () => {
  it('workspace B không thấy sản phẩm/biến thể của A (kể cả thành viên B)', async () => {
    const p = await seedProduct(wsA);
    await seedVariant(wsA, p, { size: 'm' });
    const own = await exec(wsA, owner, 'SELECT id FROM cf.products');
    expect(own.rows.map((r) => (r as { id: string }).id)).toContain(p);
    const other = await exec(wsB, outsider, `SELECT id FROM cf.products WHERE id = '${p}'`);
    expect(other.rows).toHaveLength(0);
    const otherV = await exec(
      wsB,
      outsider,
      `SELECT id FROM cf.product_variants WHERE product_id = '${p}'`,
    );
    expect(otherV.rows).toHaveLength(0);
  });

  it('người không phải thành viên A không đọc được dù đặt đúng workspace A', async () => {
    await seedProduct(wsA);
    const rows = await exec(wsA, stranger, 'SELECT id FROM cf.products');
    expect(rows.rows).toHaveLength(0);
  });

  it('Owner và Staff thêm/sửa được; người lạ và B bị chặn ghi', async () => {
    for (const user of [owner, staff]) {
      const r = await exec(
        wsA,
        user,
        `INSERT INTO cf.products (workspace_id, name) VALUES ('${wsA}', 'Mới') RETURNING id`,
      );
      const id = (r.rows[0] as { id: string }).id;
      await exec(wsA, user, `UPDATE cf.products SET name = 'Đổi' WHERE id = '${id}'`);
    }
    expect(
      await expectRejectCode(
        exec(wsA, stranger, `INSERT INTO cf.products (workspace_id, name) VALUES ('${wsA}', 'X')`),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        exec(wsB, outsider, `INSERT INTO cf.products (workspace_id, name) VALUES ('${wsA}', 'X')`),
      ),
    ).toBe(RLS);
  });

  it('withWorkspace trần (không người dùng, không hệ thống) không ghi được', async () => {
    expect(
      await expectRejectCode(
        db.withWorkspace(wsA, (tx) =>
          tx.execute(sql`INSERT INTO cf.products (workspace_id, name) VALUES (${wsA}::uuid, 'X')`),
        ),
      ),
    ).toBe(RLS);
  });

  it('hệ thống (withJob) ghi được sản phẩm và biến thể', async () => {
    await db.withJob(wsA, async (tx) => {
      const r = await tx.execute<{ id: string }>(
        sql`INSERT INTO cf.products (workspace_id, name, source, external_id) VALUES (${wsA}::uuid, 'Sync', 'shopify', ${newId()}) RETURNING id`,
      );
      await tx.execute(
        sql`INSERT INTO cf.product_variants (workspace_id, product_id) VALUES (${wsA}::uuid, ${r.rows[0]?.id}::uuid)`,
      );
    });
  });

  it('biến thể không gắn chéo workspace (khóa ngoại ghép)', async () => {
    const p = await seedProduct(wsA);
    expect(
      await expectRejectCode(
        admin.query('INSERT INTO cf.product_variants (workspace_id, product_id) VALUES ($1, $2)', [
          wsB,
          p,
        ]),
      ),
    ).toBe(FK);
  });

  it('cf_app không DELETE được; không đổi workspace_id/source/external_id/product_id', async () => {
    const p = await seedProduct(wsA);
    const v = await seedVariant(wsA, p, { size: 's' });
    expect(
      await expectRejectCode(exec(wsA, owner, `DELETE FROM cf.products WHERE id = '${p}'`)),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        exec(wsA, owner, `UPDATE cf.products SET workspace_id = '${wsB}' WHERE id = '${p}'`),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        exec(wsA, owner, `UPDATE cf.products SET source = 'excel' WHERE id = '${p}'`),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        exec(wsA, owner, `UPDATE cf.product_variants SET product_id = '${p}' WHERE id = '${v}'`),
      ),
    ).toBe(RLS);
  });

  it('ràng buộc: giá/tồn âm, nguồn lạ, thẻ không phải object bị từ chối', async () => {
    const p = await seedProduct(wsA);
    expect(
      await expectRejectCode(
        admin.query('UPDATE cf.products SET price_vnd = -1 WHERE id = $1', [p]),
      ),
    ).toBe(CHECK);
    expect(
      await expectRejectCode(admin.query('UPDATE cf.products SET stock = -1 WHERE id = $1', [p])),
    ).toBe(CHECK);
    expect(
      await expectRejectCode(
        admin.query("UPDATE cf.products SET source = 'tiktok' WHERE id = $1", [p]),
      ),
    ).toBe(CHECK);
    expect(
      await expectRejectCode(admin.query("UPDATE cf.products SET card = '[]' WHERE id = $1", [p])),
    ).toBe(CHECK);
    const v = await seedVariant(wsA, p, { size: 'xs' });
    expect(
      await expectRejectCode(
        admin.query("UPDATE cf.product_variants SET attrs = '[]' WHERE id = $1", [v]),
      ),
    ).toBe(CHECK);
  });
});

describe('FR-135 products.rev', () => {
  it('bắt đầu 1; tăng khi giá/tồn/trạng thái sản phẩm đổi; không tăng khi chỉ đổi tên', async () => {
    const p = await seedProduct(wsA);
    expect(await revOf(p)).toBe(1);
    await exec(wsA, owner, `UPDATE cf.products SET name = 'Tên khác' WHERE id = '${p}'`);
    expect(await revOf(p)).toBe(1);
    await exec(wsA, owner, `UPDATE cf.products SET price_vnd = 120000 WHERE id = '${p}'`);
    expect(await revOf(p)).toBe(2);
    await exec(wsA, owner, `UPDATE cf.products SET stock = 9 WHERE id = '${p}'`);
    expect(await revOf(p)).toBe(3);
    await exec(wsA, owner, `UPDATE cf.products SET status = 'archived' WHERE id = '${p}'`);
    expect(await revOf(p)).toBe(4);
  });

  it('tăng khi thêm biến thể và khi đổi giá/tồn/trạng thái/thuộc tính biến thể; không khi chỉ đổi sku', async () => {
    const p = await seedProduct(wsA);
    const before = await revOf(p);
    const r = await exec(
      wsA,
      staff,
      `INSERT INTO cf.product_variants (workspace_id, product_id, attrs_norm, price_vnd, stock)
       VALUES ('${wsA}', '${p}', '{"size":"m"}', 1000, 2) RETURNING id`,
    );
    const v = (r.rows[0] as { id: string }).id;
    expect(await revOf(p)).toBe(before + 1);
    await exec(wsA, staff, `UPDATE cf.product_variants SET sku = 'SKU-1' WHERE id = '${v}'`);
    expect(await revOf(p)).toBe(before + 1);
    await exec(wsA, staff, `UPDATE cf.product_variants SET stock = 0 WHERE id = '${v}'`);
    expect(await revOf(p)).toBe(before + 2);
    await exec(wsA, staff, `UPDATE cf.product_variants SET price_vnd = 2000 WHERE id = '${v}'`);
    expect(await revOf(p)).toBe(before + 3);
    await exec(wsA, staff, `UPDATE cf.product_variants SET status = 'archived' WHERE id = '${v}'`);
    expect(await revOf(p)).toBe(before + 4);
    await exec(
      wsA,
      staff,
      `UPDATE cf.product_variants SET attrs_norm = '{"size":"l"}' WHERE id = '${v}'`,
    );
    expect(await revOf(p)).toBe(before + 5);
  });

  it('chỉ tăng rev của sản phẩm chứa biến thể, không đụng sản phẩm khác', async () => {
    const p1 = await seedProduct(wsA);
    const p2 = await seedProduct(wsA);
    const v = await seedVariant(wsA, p1, { size: 'm' });
    const [b1, b2] = [await revOf(p1), await revOf(p2)];
    await exec(wsA, owner, `UPDATE cf.product_variants SET stock = 77 WHERE id = '${v}'`);
    expect(await revOf(p1)).toBe(b1 + 1);
    expect(await revOf(p2)).toBe(b2);
  });

  it('người dùng không tự đặt rev (không quyền cột; INSERT cũng vậy)', async () => {
    const p = await seedProduct(wsA);
    expect(
      await expectRejectCode(exec(wsA, owner, `UPDATE cf.products SET rev = 99 WHERE id = '${p}'`)),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        exec(
          wsA,
          owner,
          `INSERT INTO cf.products (workspace_id, name, rev) VALUES ('${wsA}', 'X', 99)`,
        ),
      ),
    ).toBe(RLS);
  });

  it('chủ sở hữu bảng cũng không đặt được rev lệch (trigger giữ nguyên rev khi không có thay đổi giá/tồn)', async () => {
    const p = await seedProduct(wsA);
    await admin.query('UPDATE cf.products SET rev = 50, name = $2 WHERE id = $1', [p, 'Z']);
    expect(await revOf(p)).toBe(1);
  });
});

describe('FR-129 findActiveVariants (docs/10 §5.2)', () => {
  it('khớp theo attrs_norm, chỉ biến thể active; không khớp → rỗng', async () => {
    const p = await seedProduct(wsA);
    const other = await seedProduct(wsB);
    const vm = await seedVariant(wsA, p, { size: 'm', color: 'black' }, 150000, 4);
    await seedVariant(wsA, p, { size: 'l', color: 'black' }, 150000, 0);
    await seedVariant(wsA, p, { size: 'm', color: 'black' }, 150000, 9, 'archived');
    await seedVariant(wsB, other, { size: 'm', color: 'black' });
    const found = await db.withActor(wsA, owner, (tx) =>
      findActiveVariants(tx, wsA, [p, other], { size: 'm', color: 'black' }),
    );
    expect(found).toEqual([
      { id: vm, productId: p, attrs: { size: 'm', color: 'black' }, priceVnd: 150000, stock: 4 },
    ]);
    const none = await db.withActor(wsA, owner, (tx) =>
      findActiveVariants(tx, wsA, [p], { size: 'xl' }),
    );
    expect(none).toEqual([]);
    expect(await db.withActor(wsA, owner, (tx) => findActiveVariants(tx, wsA, [], {}))).toEqual([]);
  });
});
