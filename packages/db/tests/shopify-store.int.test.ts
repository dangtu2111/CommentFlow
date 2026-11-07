import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  disconnectShopifyStore,
  getShopifyStore,
  readShopifyStoreCredentials,
  recordShopifySync,
  requestShopifySync,
  saveShopifyStore,
} from '../src/shopify-store';
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
 * SHOPIFY-CONNECT-STORE (migration 0064): Owner lưu/ngắt/yêu cầu đồng bộ; CHỈ hệ thống đọc ciphertext và ghi kết quả;
 * Staff/người lạ không thấy dòng; web không đọc được cột token; cô lập workspace.
 */
const RLS = '42501';
const INVALID = '22023';
const NOT_FOUND = 'P0002';
const CHECK = '23514';

let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
const cipher = () => randomBytes(40);
const DOMAIN = 'demo-shop.myshopify.com';
const CLIENT_ID = 'abcdef0123456789abcdef0123456789';

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'shopify-owner');
  staff = await seedUser(admin, 'shopify-staff');
  otherOwner = await seedUser(admin, 'shopify-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('save / get', () => {
  it('chưa kết nối → null', async () => {
    expect(await app.withActor(ws, owner, (tx) => getShopifyStore(tx, ws))).toBeNull();
  });

  it('Owner lưu → connected; đọc lại thấy tên miền, không có trường bí mật', async () => {
    await app.withActor(ws, owner, (tx) =>
      saveShopifyStore(tx, {
        shopDomain: DOMAIN,
        clientId: CLIENT_ID,
        ciphertext: cipher(),
        keyVersion: 1,
      }),
    );
    const store = await app.withActor(ws, owner, (tx) => getShopifyStore(tx, ws));
    expect(store).toMatchObject({ shopDomain: DOMAIN, status: 'connected' });
    expect(Object.keys(store ?? {})).not.toContain('ciphertext');
  });

  it('web (cf_app) KHÔNG đọc được cột token trực tiếp', async () => {
    const code = await expectRejectCode(
      app.withActor(ws, owner, (tx) =>
        tx.execute(sql`SELECT client_secret_enc FROM cf.shopify_stores`),
      ),
    );
    expect(code).toBe(RLS);
  });

  it('Staff và người lạ không thấy dòng; Staff không lưu được', async () => {
    expect(await app.withActor(ws, staff, (tx) => getShopifyStore(tx, ws))).toBeNull();
    const code = await expectRejectCode(
      app.withActor(ws, staff, (tx) =>
        saveShopifyStore(tx, {
          shopDomain: 'x.myshopify.com',
          clientId: CLIENT_ID,
          ciphertext: cipher(),
          keyVersion: 1,
        }),
      ),
    );
    expect(code).toBe(RLS);
  });

  it('cô lập workspace: workspace khác không thấy kết nối', async () => {
    expect(await app.withActor(other, otherOwner, (tx) => getShopifyStore(tx, other))).toBeNull();
  });

  it('tên miền sai (SSRF) và ciphertext quá ngắn bị từ chối', async () => {
    for (const shopDomain of [
      'evil.com',
      'a.myshopify.com.evil.com',
      'http://a.myshopify.com',
      '-a.myshopify.com',
    ]) {
      const code = await expectRejectCode(
        app.withActor(ws, owner, (tx) =>
          saveShopifyStore(tx, {
            shopDomain,
            clientId: CLIENT_ID,
            ciphertext: cipher(),
            keyVersion: 1,
          }),
        ),
      );
      expect(code, shopDomain).toBe(INVALID);
    }
    const short = await expectRejectCode(
      app.withActor(ws, owner, (tx) =>
        saveShopifyStore(tx, {
          shopDomain: 'ok.myshopify.com',
          clientId: CLIENT_ID,
          ciphertext: Buffer.alloc(5),
          keyVersion: 1,
        }),
      ),
    );
    expect(short).toBe(INVALID);
  });

  it('Client ID sai dạng bị từ chối (rỗng, quá ngắn, ký tự lạ)', async () => {
    for (const clientId of ['', 'ngan', 'co khoang trang 0123456789', 'x'.repeat(101)]) {
      const code = await expectRejectCode(
        app.withActor(ws, owner, (tx) =>
          saveShopifyStore(tx, {
            shopDomain: DOMAIN,
            clientId,
            ciphertext: cipher(),
            keyVersion: 1,
          }),
        ),
      );
      expect(code, clientId).toBe(INVALID);
    }
  });

  it('lưu lại (nhập token mới) giữ MỘT dòng', async () => {
    await app.withActor(ws, owner, (tx) =>
      saveShopifyStore(tx, {
        shopDomain: DOMAIN,
        clientId: CLIENT_ID,
        ciphertext: cipher(),
        keyVersion: 2,
      }),
    );
    const rows = await admin.query(
      'SELECT count(*)::int AS n FROM cf.shopify_stores WHERE workspace_id = $1',
      [ws],
    );
    expect(rows.rows[0].n).toBe(1);
  });
});

describe('đọc token + ghi kết quả: chỉ hệ thống', () => {
  it('Owner (withActor) KHÔNG đọc được ciphertext', async () => {
    const code = await expectRejectCode(
      app.withActor(ws, owner, (tx) => readShopifyStoreCredentials(tx)),
    );
    expect(code).toBe(RLS);
  });

  it('withJob đọc được đúng ciphertext + key_version', async () => {
    const token = await worker.withJob(ws, (tx) => readShopifyStoreCredentials(tx));
    expect(token?.shopDomain).toBe(DOMAIN);
    expect(token?.keyVersion).toBe(2);
    expect(token?.clientId).toBe(CLIENT_ID);
    expect(token?.ciphertext.length).toBe(40);
  });

  it('Owner KHÔNG ghi được kết quả đồng bộ; withJob ghi được', async () => {
    const code = await expectRejectCode(
      app.withActor(ws, owner, (tx) => recordShopifySync(tx, 'ok', { productsCreated: 1 })),
    );
    expect(code).toBe(RLS);
    await worker.withJob(ws, (tx) =>
      recordShopifySync(tx, 'ok', {
        productsCreated: 3,
        productsUpdated: 1,
        variantsCreated: 5,
        variantsUpdated: 0,
      }),
    );
    const store = await app.withActor(ws, owner, (tx) => getShopifyStore(tx, ws));
    expect(store?.lastSyncResult).toBe('ok');
    expect(store?.lastSyncSummary).toMatchObject({ productsCreated: 3, variantsCreated: 5 });
    expect(store?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('kết quả lạ bị từ chối', async () => {
    const code = await expectRejectCode(
      worker.withJob(ws, (tx) => recordShopifySync(tx, 'bay-bong' as never)),
    );
    expect(code).toBe(INVALID);
  });

  it('token_invalid hạ trạng thái xuống invalid; không còn đọc được token để chạy tiếp', async () => {
    await worker.withJob(ws, (tx) => recordShopifySync(tx, 'token_invalid'));
    const store = await app.withActor(ws, owner, (tx) => getShopifyStore(tx, ws));
    expect(store?.status).toBe('invalid');
    expect(await worker.withJob(ws, (tx) => readShopifyStoreCredentials(tx))).toBeNull();
  });
});

describe('yêu cầu đồng bộ (thời gian chờ nguyên tử) + ngắt kết nối', () => {
  it('chỉ cho khi connected: lần đầu true, lần hai trong 60 giây false', async () => {
    expect(await app.withActor(ws, owner, (tx) => requestShopifySync(tx))).toBe(false); // đang invalid
    await app.withActor(ws, owner, (tx) =>
      saveShopifyStore(tx, {
        shopDomain: DOMAIN,
        clientId: CLIENT_ID,
        ciphertext: cipher(),
        keyVersion: 1,
      }),
    );
    expect(await app.withActor(ws, owner, (tx) => requestShopifySync(tx))).toBe(true);
    expect(await app.withActor(ws, owner, (tx) => requestShopifySync(tx))).toBe(false);
  });

  it('Staff không yêu cầu được', async () => {
    const code = await expectRejectCode(app.withActor(ws, staff, (tx) => requestShopifySync(tx)));
    expect(code).toBe(RLS);
  });

  it('ngắt kết nối: xóa token, đặt disconnected, ghi nhật ký; Staff không ngắt được; không có kết nối → P0002', async () => {
    const denied = await expectRejectCode(
      app.withActor(ws, staff, (tx) => disconnectShopifyStore(tx)),
    );
    expect(denied).toBe(RLS);
    await app.withActor(ws, owner, (tx) => disconnectShopifyStore(tx));
    const store = await app.withActor(ws, owner, (tx) => getShopifyStore(tx, ws));
    expect(store?.status).toBe('disconnected');
    expect(await worker.withJob(ws, (tx) => readShopifyStoreCredentials(tx))).toBeNull();
    const logs = await admin.query(
      "SELECT action FROM core.action_logs WHERE workspace_id = $1 AND action LIKE 'shopify.%'",
      [ws],
    );
    expect(logs.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['shopify.connected', 'shopify.reconnected', 'shopify.disconnected']),
    );
    const none = await expectRejectCode(
      app.withActor(other, otherOwner, (tx) => disconnectShopifyStore(tx)),
    );
    expect(none).toBe(NOT_FOUND);
  });

  it('CHECK trạng thái chống giá trị lạ ở mức bảng', async () => {
    await expect(
      admin.query("UPDATE cf.shopify_stores SET status = 'bay' WHERE workspace_id = $1", [ws]),
    ).rejects.toMatchObject({ code: CHECK });
  });
});
