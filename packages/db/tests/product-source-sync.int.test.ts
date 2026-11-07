import type { ImportProductPlan } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { applyProductSourceSync } from '../src/queries/product-source-sync';
import { loadTryProducts } from '../src/queries/try-products';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** SHOPIFY-IMPORT (FR-052, Q-SHI1): ghi nguồn ngoài qua withActor, ghi đè theo nguồn, idempotent, chéo workspace. */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let owner: string;
let outsider: string;

// Fixture (không phải dữ liệu thật).
const plan = (price: number, stock: number): ImportProductPlan[] => [
  {
    externalId: 'gid://shopify/Product/1',
    name: 'Áo thun',
    category: 'Áo',
    url: null,
    searchText: 'ao thun',
    priceVnd: price,
    compareAtVnd: null,
    stock,
    variantsSnapshot: [{ sku: 'S1', attrs: {}, priceVnd: price, compareAtVnd: null, stock }],
    variants: [
      {
        externalId: 'gid://shopify/ProductVariant/11',
        sku: 'S1',
        attrs: {},
        attrsNorm: {},
        priceVnd: price,
        compareAtVnd: null,
        stock,
      },
    ],
  },
];

const productRows = (ws: string) =>
  admin.query(
    'SELECT name, price_vnd, stock, locked_fields, source FROM cf.products WHERE workspace_id = $1',
    [ws],
  );

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  owner = await seedUser(admin);
  outsider = await seedUser(admin);
  await seedMember(admin, wsA, owner, 'owner');
  await seedMember(admin, wsB, outsider, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-052 ghi đồng bộ nguồn Shopify', () => {
  it('tạo sản phẩm nguồn shopify, khóa trường nguồn, chạy lại không nhân đôi', async () => {
    const first = await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(tx, wsA, 'shopify', plan(150000, 5)),
    );
    expect(first).toEqual({
      productsCreated: 1,
      productsUpdated: 0,
      variantsCreated: 1,
      variantsUpdated: 0,
    });
    const again = await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(tx, wsA, 'shopify', plan(150000, 5)),
    );
    expect(again.productsUpdated).toBe(1);
    const rows = (await productRows(wsA)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('shopify');
    expect([...rows[0].locked_fields].sort()).toEqual(
      ['compare_at_vnd', 'name', 'price_vnd', 'stock'].sort(),
    );
  });

  it('Shopify là nguồn đúng: đổi giá/tồn ghi đè dù trường đã khóa', async () => {
    await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(tx, wsA, 'shopify', plan(99000, 1)),
    );
    const row = (await productRows(wsA)).rows[0];
    expect(Number(row.price_vnd)).toBe(99000);
    expect(row.stock).toBe(1);
    const variant = await admin.query(
      'SELECT price_vnd, stock FROM cf.product_variants WHERE workspace_id = $1',
      [wsA],
    );
    expect(Number(variant.rows[0].price_vnd)).toBe(99000);
    expect(variant.rows[0].stock).toBe(1);
  });

  it('KB-PRODUCT-IMAGE lưu ảnh nguồn, cập nhật khi đổi, xóa về null khi nguồn bỏ ảnh; URL không phải http(s) bị CSDL từ chối', async () => {
    const withImage = (imageUrl: string | null): ImportProductPlan[] =>
      plan(150000, 5).map((p) => ({ ...p, externalId: 'gid://shopify/Product/img', imageUrl }));
    const read = async () =>
      (
        await admin.query(
          "SELECT image_url FROM cf.products WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/img'",
          [wsA],
        )
      ).rows[0]?.image_url;
    const sync = (p: ImportProductPlan[]) =>
      db.withActor(wsA, owner, (tx) => applyProductSourceSync(tx, wsA, 'shopify', p));

    await sync(withImage('https://cdn.shopify.com/s/files/1/a.jpg'));
    expect(await read()).toBe('https://cdn.shopify.com/s/files/1/a.jpg');
    await sync(withImage('https://cdn.shopify.com/s/files/1/b.jpg'));
    expect(await read()).toBe('https://cdn.shopify.com/s/files/1/b.jpg');
    await sync(withImage(null));
    expect(await read()).toBeNull();
    await expect(sync(withImage('javascript:alert(1)'))).rejects.toThrow();
    await admin.query(
      "DELETE FROM cf.products WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/img'",
      [wsA],
    ); // dọn để không làm lệch test đếm dòng bên dưới
  });

  it('giữ khóa trường do người dùng thêm (hợp nhất, không mất)', async () => {
    await admin.query(
      `UPDATE cf.products SET locked_fields = locked_fields || ARRAY['url'] WHERE workspace_id = $1`,
      [wsA],
    );
    await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(tx, wsA, 'shopify', plan(99000, 1)),
    );
    expect((await productRows(wsA)).rows[0].locked_fields).toContain('url');
  });

  it('FR-058 thẻ sản phẩm: ghi từ nguồn, GỘP (khóa nguồn thắng, khóa khác giữ), không có card thì không xóa thẻ', async () => {
    const withCard = (card: ImportProductPlan['card']): ImportProductPlan[] =>
      plan(150000, 5).map((p) => ({ ...p, externalId: 'gid://shopify/Product/card', card }));
    const cardOf = async () =>
      (
        await admin.query(
          `SELECT card FROM cf.products WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/card'`,
          [wsA],
        )
      ).rows[0].card;
    await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(
        tx,
        wsA,
        'shopify',
        withCard({ material: 'cotton', origin: 'Việt Nam' }),
      ),
    );
    expect(await cardOf()).toEqual({ material: 'cotton', origin: 'Việt Nam' });
    // Người dùng tự thêm một khóa (bảo hành) — đồng bộ sau không được xóa nó.
    await admin.query(
      `UPDATE cf.products SET card = card || '{"warranty":"7 ngày"}'::jsonb
        WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/card'`,
      [wsA],
    );
    await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(tx, wsA, 'shopify', withCard({ material: 'lụa' })),
    );
    expect(await cardOf()).toEqual({ material: 'lụa', origin: 'Việt Nam', warranty: '7 ngày' });
    await db.withActor(wsA, owner, (tx) =>
      applyProductSourceSync(tx, wsA, 'shopify', withCard(undefined)),
    );
    expect(await cardOf()).toEqual({ material: 'lụa', origin: 'Việt Nam', warranty: '7 ngày' });
    // Đường đọc cho AI (`loadTryProducts`): có thẻ hợp lệ → trả thẻ; thẻ hỏng (khóa lạ) → bỏ, không ném.
    const id = (
      await admin.query(
        `SELECT id FROM cf.products WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/card'`,
        [wsA],
      )
    ).rows[0].id as string;
    const loaded = await db.withActor(wsA, owner, (tx) => loadTryProducts(tx, wsA, [id]));
    expect(loaded[0]?.card).toEqual({ material: 'lụa', origin: 'Việt Nam', warranty: '7 ngày' });
    await admin.query(`UPDATE cf.products SET card = '{"khoa_la":"x"}'::jsonb WHERE id = $1`, [id]);
    const junk = await db.withActor(wsA, owner, (tx) => loadTryProducts(tx, wsA, [id]));
    expect(junk[0]).toBeDefined();
    expect(junk[0]?.card).toBeUndefined();
    // Dọn: các test sau đếm số sản phẩm của workspace A.
    await admin.query(
      `DELETE FROM cf.product_variants WHERE product_id IN (SELECT id FROM cf.products WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/card')`,
      [wsA],
    );
    await admin.query(
      `DELETE FROM cf.products WHERE workspace_id = $1 AND external_id = 'gid://shopify/Product/card'`,
      [wsA],
    );
  });

  it('workspace khác không thấy dữ liệu; ghi vào B tạo hàng riêng của B', async () => {
    const seenFromB = await db.withActor(wsB, outsider, (tx) =>
      tx.execute(sql`SELECT id FROM cf.products WHERE source = 'shopify'`),
    );
    expect(seenFromB.rows).toHaveLength(0);
    await db.withActor(wsB, outsider, (tx) =>
      applyProductSourceSync(tx, wsB, 'shopify', plan(1, 1)),
    );
    expect((await productRows(wsA)).rows).toHaveLength(1);
    expect((await productRows(wsB)).rows).toHaveLength(1);
  });

  it('thành viên workspace A không ghi được vào workspace B (RLS)', async () => {
    expect(
      await expectRejectCode(
        db.withActor(wsA, owner, (tx) => applyProductSourceSync(tx, wsB, 'shopify', plan(2, 2))),
      ),
    ).toBe('42501');
  });
});
