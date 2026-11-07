import { randomBytes, randomUUID } from 'node:crypto';
import { createTokenCipher, parseTokenKeys } from '@flow/connectors';
import { createDb, type FlowDb, saveShopifyStore } from '@flow/db';
import { SHOPIFY_TOKEN_KEY } from '@flow/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  jsonResponse,
  productNode,
  productsPage,
} from '../../../packages/connectors/src/shopify/fixtures';
import { createShopifySyncHandler } from '../src/jobs/shopify-sync';

/**
 * SHOPIFY-CONNECT-STORE đầu-cuối (luồng client credentials): web-giả (Owner) mã hóa Client secret rồi lưu cùng Client ID;
 * worker (withJob) đọc, giải mã, ĐỔI lấy token Admin API (phản hồi GIẢ theo tài liệu), gọi Shopify, nạp `products` và ghi
 * kết quả. Không gọi Shopify thật.
 */
let web: FlowDb;
let worker: FlowDb;
let admin: pg.Pool;
let ws: string;
let owner: string;

const hex = () => randomBytes(32).toString('hex');
const cipher = createTokenCipher(parseTokenKeys(`v1:${hex()}`));
const CLIENT_ID = 'abcdef0123456789abcdef0123456789';
const CLIENT_SECRET = 'shpss_e2e_fake_secret_0123';
const EXCHANGED = 'shpat_e2e_exchanged_token';
const logger = { info: () => undefined, warn: () => undefined };
const job = (workspaceId: string) =>
  [{ id: 'j1', name: 'shopify-sync', data: { workspaceId } }] as never;

type Seen = { url: string; headers: Record<string, string>; body: string };

/** Phản hồi giả: điểm cuối đổi token trả token; GraphQL trả `graphql`. `seen` ghi lại mọi yêu cầu. */
function fakeShopify(options: {
  token?: () => Response;
  graphql?: () => Response;
  seen?: Seen[];
}): typeof fetch {
  return ((url: string | URL, init?: RequestInit) => {
    const href = String(url);
    options.seen?.push({
      url: href,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ''),
    });
    if (href.includes('/admin/oauth/access_token')) {
      return Promise.resolve(
        options.token?.() ??
          jsonResponse({ access_token: EXCHANGED, scope: 'read_products', expires_in: 86399 }),
      );
    }
    return Promise.resolve(
      options.graphql?.() ?? jsonResponse(productsPage([productNode(1), productNode(2)], null)),
    );
  }) as unknown as typeof fetch;
}

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  const workerUrl = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !workerUrl || !adminUrl) {
    throw new Error('Thiếu TEST_DATABASE_URL / TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  }
  web = createDb({ connectionString: url, max: 3 });
  worker = createDb({ connectionString: workerUrl, max: 3 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  ws = randomUUID();
  owner = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop shopify',
    `shop-${ws}`,
  ]);
  await admin.query('INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3)', [
    owner,
    `${owner}@example.test`,
    'Chủ shop',
  ]);
  await admin.query(
    "INSERT INTO core.members (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    [ws, owner],
  );
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close()]);
  await admin.end();
});

const connect = (secret = CLIENT_SECRET, forWorkspace = ws) =>
  web.withActor(ws, owner, (tx) => {
    const { ciphertext, keyVersion } = cipher.encrypt(secret, {
      workspaceId: forWorkspace,
      channelId: SHOPIFY_TOKEN_KEY,
    });
    return saveShopifyStore(tx, {
      shopDomain: 'demo-shop.myshopify.com',
      clientId: CLIENT_ID,
      ciphertext,
      keyVersion,
    });
  });
const storeRow = async () =>
  (
    await admin.query(
      'SELECT status, last_sync_result, last_sync_summary, client_secret_enc FROM cf.shopify_stores WHERE workspace_id = $1',
      [ws],
    )
  ).rows[0];
const productCount = async () =>
  (
    await admin.query(
      "SELECT count(*)::int AS n FROM cf.products WHERE workspace_id = $1 AND source = 'shopify'",
      [ws],
    )
  ).rows[0].n as number;

function handler(fetchImpl: typeof fetch, enabled = true) {
  return createShopifySyncHandler({ db: worker, cipher, enabled, logger, fetchImpl });
}

describe('đồng bộ Shopify đầu-cuối (client credentials)', () => {
  it('Client ID/secret đúng → đổi token, nạp sản phẩm + biến thể, ghi kết quả ok; chạy lại không nhân đôi', async () => {
    await connect();
    await handler(fakeShopify({}))(job(ws));
    expect(await productCount()).toBe(2);
    const row = await storeRow();
    expect(row.last_sync_result).toBe('ok');
    expect(row.last_sync_summary).toMatchObject({ productsCreated: 2, variantsCreated: 4 });
    await handler(fakeShopify({}))(job(ws));
    expect(await productCount()).toBe(2);
  });

  it('gửi Client ID + secret chỉ ở THÂN yêu cầu đổi token; GraphQL dùng token vừa đổi; secret không lưu dạng rõ', async () => {
    const seen: Seen[] = [];
    await handler(fakeShopify({ seen, graphql: () => jsonResponse(productsPage([], null)) }))(
      job(ws),
    );
    const exchange = seen.find((r) => r.url.includes('/admin/oauth/access_token'));
    const params = new URLSearchParams(exchange?.body);
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('client_secret')).toBe(CLIENT_SECRET);
    expect(params.get('grant_type')).toBe('client_credentials');
    expect(exchange?.url).not.toContain(CLIENT_SECRET);
    const graphql = seen.find((r) => r.url.includes('/graphql.json'));
    expect(graphql?.headers['X-Shopify-Access-Token']).toBe(EXCHANGED);
    const stored = (await storeRow()).client_secret_enc as Buffer;
    expect(stored.toString('latin1')).not.toContain(CLIENT_SECRET);
  });

  it('đổi token bị từ chối (401) → token_invalid, trạng thái invalid; không còn đọc được để chạy tiếp', async () => {
    await handler(fakeShopify({ token: () => new Response('{}', { status: 401 }) }))(job(ws));
    const row = await storeRow();
    expect(row.last_sync_result).toBe('token_invalid');
    expect(row.status).toBe('invalid');
  });

  it('nhập lại → connected; cờ tắt → unavailable, KHÔNG gọi Shopify', async () => {
    await connect();
    const seen: Seen[] = [];
    await handler(fakeShopify({ seen }), false)(job(ws));
    expect(seen).toHaveLength(0);
    expect((await storeRow()).last_sync_result).toBe('unavailable');
  });

  it('Client secret mã hóa cho workspace khác (AAD sai) → token_invalid, không gọi Shopify, không nạp dữ liệu', async () => {
    await connect(CLIENT_SECRET, randomUUID());
    const before = await productCount();
    const seen: Seen[] = [];
    await handler(fakeShopify({ seen }))(job(ws));
    expect((await storeRow()).last_sync_result).toBe('token_invalid');
    expect(seen).toHaveLength(0);
    expect(await productCount()).toBe(before);
  });

  it('dữ liệu job sai (không phải uuid) → ném, không chạm DB', async () => {
    await expect(
      handler(fakeShopify({}))([
        { id: 'j2', name: 'shopify-sync', data: { workspaceId: 'x' } },
      ] as never),
    ).rejects.toThrow();
  });
});
