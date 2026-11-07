import {
  buildShopifyImportPlan,
  createShopifyConnector,
  exchangeShopifyClientCredentials,
  isPlatformError,
  type ShopifyCatalog,
  type TokenCipher,
  TokenDecryptError,
} from '@flow/connectors';
import {
  applyProductSourceSync,
  type FlowDb,
  readShopifyStoreCredentials,
  recordShopifySync,
  type ShopifySyncDetail,
  type ShopifySyncResult,
  type ShopifySyncSummary,
} from '@flow/db';
import {
  AppError,
  type ImportProductPlan,
  SHOPIFY_TOKEN_KEY,
  shopifySyncJobSchema,
} from '@flow/shared';
import type { Logger } from '../logger';
import type { BatchHandler } from './run-job';

export type ShopifySyncOutcome = ShopifySyncResult | 'skipped';

export type ShopifySyncDeps = {
  /** Cờ `SHOPIFY_ENABLED` (mặc định tắt): tắt thì KHÔNG đọc token, KHÔNG gọi Shopify. */
  enabled: boolean;
  workspaceId: string;
  readCredentials: () => Promise<{
    shopDomain: string;
    clientId: string;
    ciphertext: Buffer;
    keyVersion: number;
  } | null>;
  /** Giải mã Client secret (AES-GCM, AAD = workspace + khóa "shopify"). */
  decrypt: (ciphertext: Buffer, keyVersion: number) => string;
  /** Đổi Client ID + Client secret lấy token Admin API (luồng client credentials; token sống ~24 giờ nên đổi mỗi lần). */
  exchange: (
    shopDomain: string,
    clientId: string,
    clientSecret: string,
  ) => Promise<{ accessToken: string; scope: string }>;
  fetchCatalog: (shopDomain: string, accessToken: string) => Promise<ShopifyCatalog>;
  buildPlan: (catalog: ShopifyCatalog) => ImportProductPlan[];
  apply: (plan: ImportProductPlan[]) => Promise<ShopifySyncSummary>;
  record: (result: ShopifySyncResult, summary: ShopifySyncDetail) => Promise<void>;
  warn: (event: { event: string; reason: string }) => void;
};

/**
 * Đồng bộ MỘT workspace: đọc thông tin xác thực (chỉ `withJob`), giải mã Client secret, đổi lấy token Admin API, gọi Shopify
 * chỉ đọc, chuẩn hóa rồi nạp vào `products`/`product_variants` (upsert theo `external_id`, không xóa sản phẩm vắng mặt —
 * đối soát là việc khác). Mọi lỗi đều thành KẾT QUẢ ghi vào kết nối, không ném (Owner đọc ở trang). Chỉ
 * `TOKEN_EXPIRED`/`PERMISSION` (Client ID/secret sai, ứng dụng chưa cài/khác tổ chức) hoặc giải mã hỏng mới đánh dấu thông tin
 * xác thực không dùng được; thiếu khóa mã hóa (lỗi cấu hình) và lỗi tạm chỉ ghi `error`. Không log secret, token, tên miền
 * hay nội dung lỗi.
 */
export async function runShopifySync(deps: ShopifySyncDeps): Promise<ShopifySyncOutcome> {
  if (!deps.enabled) {
    await deps.record('unavailable', {});
    return 'unavailable';
  }
  const stored = await deps.readCredentials();
  if (!stored) return 'skipped';

  let result: ShopifySyncResult = 'error';
  let detail: ShopifySyncDetail = {};
  let grantedScope: string | null = null; // null = chưa đổi được token; '' = token KHÔNG có quyền nào
  let stage: 'decrypt' | 'exchange' | 'catalog' = 'decrypt';
  try {
    let clientSecret: string;
    try {
      clientSecret = deps.decrypt(stored.ciphertext, stored.keyVersion);
    } catch (error) {
      if (error instanceof TokenDecryptError) {
        const reason = 'decrypt_failed';
        await deps.record('token_invalid', { reason });
        return 'token_invalid';
      }
      throw error;
    }
    stage = 'exchange';
    const exchanged = await deps.exchange(stored.shopDomain, stored.clientId, clientSecret);
    const accessToken = exchanged.accessToken;
    grantedScope = scopeOf(exchanged.scope);
    stage = 'catalog';
    const catalog = await deps.fetchCatalog(stored.shopDomain, accessToken);
    detail = {
      ...(await deps.apply(deps.buildPlan(catalog))),
      ...(grantedScope === null ? {} : { scope: grantedScope }),
    };
    result = 'ok';
  } catch (error) {
    detail = {};
    if (isPlatformError(error) && (error.code === 'TOKEN_EXPIRED' || error.code === 'PERMISSION')) {
      result = 'token_invalid';
      detail = {
        reason: reasonOf(stage, error.message),
        ...(grantedScope === null ? {} : { scope: grantedScope }),
      };
    } else {
      result = 'error';
      detail = {
        reason: reasonOf(stage, isPlatformError(error) ? error.code : 'unknown'),
        ...(grantedScope === null ? {} : { scope: grantedScope }),
      };
      deps.warn({
        event: 'shopify_sync_failed',
        reason: isPlatformError(error) ? error.code : 'unknown',
      });
    }
  }
  await deps.record(result, detail);
  return result;
}

/** Danh sách quyền token được cấp, lọc ký tự (chỉ chữ thường, số, `_`, `,`) và cắt 300 ký tự — an toàn để lưu và hiển thị. */
export function scopeOf(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_,]/g, '')
    .slice(0, 300);
}

/**
 * Mã lý do hiển thị cho Owner: `<bước>:<mã>`. Mã chỉ gồm chữ/số/_ . : - (đã lọc, tối đa 120 ký tự) — không bao giờ chứa
 * secret, token, tên miền hay nội dung phản hồi.
 */
export function reasonOf(stage: string, code: string): string {
  return `${stage}:${code}`.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120);
}

/** Nối với DB và Shopify thật; mỗi bước DB dùng `withJob` (đường hệ thống của workspace). */
export function createShopifySyncHandler(deps: {
  db: FlowDb;
  cipher: TokenCipher | undefined;
  enabled: boolean;
  apiVersion?: string;
  logger: Pick<Logger, 'info' | 'warn'>;
  fetchImpl?: typeof fetch;
}): BatchHandler {
  const { db, cipher, enabled, logger } = deps;
  return async (jobs) => {
    for (const job of jobs) {
      const parsed = shopifySyncJobSchema.safeParse(job.data);
      // Không đưa dữ liệu job vào thông báo.
      if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
      const workspaceId = parsed.data.workspaceId;
      const outcome = await runShopifySync({
        enabled: enabled && cipher !== undefined,
        workspaceId,
        readCredentials: () => db.withJob(workspaceId, (tx) => readShopifyStoreCredentials(tx)),
        decrypt: (ciphertext, keyVersion) =>
          (cipher as TokenCipher).decrypt(ciphertext, keyVersion, {
            workspaceId,
            channelId: SHOPIFY_TOKEN_KEY,
          }),
        exchange: (shopDomain, clientId, clientSecret) =>
          exchangeShopifyClientCredentials({
            shopDomain,
            clientId,
            clientSecret,
            ...(deps.fetchImpl ? { fetch: deps.fetchImpl } : {}),
          }).then((token) => ({ accessToken: token.accessToken, scope: token.scope })),
        fetchCatalog: (shopDomain, accessToken) =>
          createShopifyConnector({
            shopDomain,
            getAccessToken: async () => accessToken,
            ...(deps.apiVersion ? { apiVersion: deps.apiVersion } : {}),
            ...(deps.fetchImpl ? { fetch: deps.fetchImpl } : {}),
          }).fetchCatalog(),
        buildPlan: buildShopifyImportPlan,
        apply: (plan) =>
          db.withJob(workspaceId, (tx) => applyProductSourceSync(tx, workspaceId, 'shopify', plan)),
        record: (result, summary) =>
          db.withJob(workspaceId, (tx) => recordShopifySync(tx, result, summary)),
        warn: (event) => logger.warn(event, 'đồng bộ Shopify'),
      });
      logger.info({ outcome }, 'đồng bộ Shopify xong');
    }
  };
}
