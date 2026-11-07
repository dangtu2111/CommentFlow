import {
  createTokenCipher,
  exchangeShopifyClientCredentials,
  isPlatformError,
  parseTokenKeys,
} from '@flow/connectors';
import { disconnectShopifyStore, requestShopifySync, saveShopifyStore } from '@flow/db/runtime';
import { SHOPIFY_SYNC_QUEUE, SHOPIFY_TOKEN_KEY } from '@flow/shared';
import { getDb } from './db';
import { enqueueJob } from './queue';
import { createShopifyConnectService, type ShopifyVerifyResult } from './shopify-connect';

/**
 * Nối dịch vụ kết nối Shopify với DB và hàng đợi thật. Khóa mã hóa đọc từ `TOKEN_ENC_KEYS` (cùng khóa token Page);
 * thiếu hoặc sai định dạng → `encrypt = undefined` (dịch vụ trả `not_configured`, giao diện báo rõ, không lộ chi tiết).
 */
function buildEncrypt() {
  try {
    const cipher = createTokenCipher(parseTokenKeys(process.env.TOKEN_ENC_KEYS));
    return (token: string, ctx: { workspaceId: string }) =>
      cipher.encrypt(token, { workspaceId: ctx.workspaceId, channelId: SHOPIFY_TOKEN_KEY });
  } catch {
    return undefined;
  }
}

/**
 * Thử đổi Client ID/secret lấy token NGAY khi lưu (chỉ khi `SHOPIFY_ENABLED=true` — cờ chung với worker, mặc định tắt):
 * trả danh sách quyền token được cấp (đã lọc ký tự) hoặc lý do bị từ chối. Secret chỉ nằm trong bộ nhớ, không log.
 */
async function verifyShopifyCredentials(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<ShopifyVerifyResult> {
  try {
    const token = await exchangeShopifyClientCredentials(input);
    return { status: 'ok', scope: token.scope.toLowerCase().replace(/[^a-z0-9_,]/g, '') };
  } catch (error) {
    if (isPlatformError(error) && error.code === 'TOKEN_EXPIRED') {
      return { status: 'invalid_credentials' };
    }
    if (isPlatformError(error) && error.code === 'PERMISSION') return { status: 'not_permitted' };
    return { status: 'unreachable' };
  }
}

export function shopifyConnect() {
  const db = getDb();
  return createShopifyConnectService({
    encrypt: buildEncrypt(),
    verify: process.env.SHOPIFY_ENABLED?.trim() === 'true' ? verifyShopifyCredentials : undefined,
    save: (session, input) =>
      db.withActor(session.workspaceId, session.userId, (tx) => saveShopifyStore(tx, input)),
    disconnect: (session) =>
      db.withActor(session.workspaceId, session.userId, (tx) => disconnectShopifyStore(tx)),
    requestSync: (session) =>
      db.withActor(session.workspaceId, session.userId, (tx) => requestShopifySync(tx)),
    enqueue: (job) => enqueueJob(SHOPIFY_SYNC_QUEUE, job),
    warn: (event) => console.error(JSON.stringify(event)),
  });
}
