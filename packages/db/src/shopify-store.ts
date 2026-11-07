import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Kết nối cửa hàng Shopify của workspace (migration 0064, SHOPIFY-CONNECT-STORE). `cf_app` không có quyền ghi bảng nên mọi
 * ghi đi qua các hàm DEFINER ở đây. Gói này CHỈ chuyển ciphertext (bytea): mã hóa/giải mã nằm ở tầng ứng dụng
 * (`@flow/connectors`, khóa `TOKEN_ENC_KEYS`).
 *
 * Quyền do DB quyết định: lưu/ngắt/yêu cầu đồng bộ = Owner (`withActor`) hoặc hệ thống; ĐỌC ciphertext và GHI kết quả đồng
 * bộ = chỉ hệ thống (`withJob`). Vi phạm → Postgres 42501.
 */
export type ShopifyStoreStatus = 'connected' | 'invalid' | 'disconnected';
export type ShopifySyncResult = 'ok' | 'token_invalid' | 'error' | 'unavailable';

export type ShopifySyncSummary = {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  /** Sản phẩm vắng mặt trên Shopify vừa được lưu trữ ở lần đồng bộ này. */
  productsArchived?: number;
};

/**
 * Phần ghi kèm kết quả: số liệu khi `ok`, hoặc `reason` (mã lý do KHÔNG chứa bí mật, đã lọc ký tự) khi lỗi — ví dụ
 * `exchange:shopify_invalid_credentials:invalid_client`, `decrypt_failed`.
 */
export type ShopifySyncDetail = Partial<ShopifySyncSummary> & {
  /** Số chính sách cửa hàng đã nạp/cập nhật; `policiesSkipped` = bỏ qua (thiếu quyền read_legal_policies hoặc lỗi tạm). */
  policiesUpdated?: number;
  policiesSkipped?: true;
  /**
   * Cửa hàng dùng tiền tệ KHÁC VND (mã 3 chữ cái hoa, hoặc `OTHER`): giá được lưu theo đơn vị nhỏ nhất của tiền tệ gốc và AI báo giá
   * đúng như nguồn, KHÔNG quy đổi (Q-SFP1). Không có khóa này = VND.
   */
  foreignCurrency?: string;
  /** Số biến thể chưa đọc được giá (chỉ ghi kèm `foreignCurrency`; giá sai dạng/quá độ chính xác thì để trống). */
  variantsWithoutPrice?: number;
  reason?: string;
  /** Danh sách quyền token được cấp (`read_products,read_inventory…`, đã lọc ký tự) — để chẩn đoán thiếu quyền. */
  scope?: string;
};

export type ShopifyStoreRow = {
  shopDomain: string;
  status: ShopifyStoreStatus;
  lastSyncedAt: Date | null;
  lastSyncRequestedAt: Date | null;
  lastSyncResult: ShopifySyncResult | null;
  lastSyncSummary: ShopifySyncDetail;
  createdAt: Date;
};

const asDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

/**
 * Lưu (hoặc nhập lại) kết nối: upsert theo workspace, đặt `connected`. `clientId` không bí mật; `ciphertext` là Client
 * secret đã mã hóa ở tầng ứng dụng (luồng client credentials của Shopify — token Admin API không được lưu vì chỉ sống 24 giờ).
 */
export async function saveShopifyStore(
  tx: Database,
  input: { shopDomain: string; clientId: string; ciphertext: Buffer; keyVersion: number },
): Promise<void> {
  await tx.execute(
    sql`SELECT cf.save_shopify_store(${input.shopDomain}, ${input.clientId}, ${input.ciphertext}, ${input.keyVersion}::integer)`,
  );
}

/** Ngắt kết nối: xóa token, đặt `disconnected` (sản phẩm đã nạp giữ nguyên). Không có kết nối → lỗi P0002. */
export async function disconnectShopifyStore(tx: Database): Promise<void> {
  await tx.execute(sql`SELECT cf.disconnect_shopify_store()`);
}

/** Giữ thời gian chờ nguyên tử: `true` = được phép đẩy job đồng bộ ngay bây giờ. */
export async function requestShopifySync(tx: Database): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(sql`SELECT cf.request_shopify_sync() AS ok`);
  return r.rows[0]?.ok === true;
}

/** Trạng thái kết nối (không bí mật); `null` nếu workspace chưa từng kết nối. Owner/hệ thống thấy được (RLS). */
export async function getShopifyStore(
  tx: Database,
  workspaceId: string,
): Promise<ShopifyStoreRow | null> {
  const r = await tx.execute<{
    shop_domain: string;
    status: ShopifyStoreStatus;
    last_synced_at: string | Date | null;
    last_sync_requested_at: string | Date | null;
    last_sync_result: ShopifySyncResult | null;
    last_sync_summary: ShopifySyncDetail;
    created_at: string | Date;
  }>(sql`
    SELECT shop_domain, status, last_synced_at, last_sync_requested_at, last_sync_result, last_sync_summary, created_at
      FROM cf.shopify_stores WHERE workspace_id = ${workspaceId}::uuid`);
  const row = r.rows[0];
  if (!row) return null;
  return {
    shopDomain: row.shop_domain,
    status: row.status,
    lastSyncedAt: row.last_synced_at === null ? null : asDate(row.last_synced_at),
    lastSyncRequestedAt:
      row.last_sync_requested_at === null ? null : asDate(row.last_sync_requested_at),
    lastSyncResult: row.last_sync_result,
    lastSyncSummary: row.last_sync_summary,
    createdAt: asDate(row.created_at),
  };
}

/** Đọc thông tin xác thực (Client ID + ciphertext Client secret) — CHỈ chạy được trong `withJob`. `null` = chưa kết nối / đã ngắt / không dùng được. */
export type ShopifyStoreCredentials = {
  shopDomain: string;
  clientId: string;
  ciphertext: Buffer;
  keyVersion: number;
};

export async function readShopifyStoreCredentials(
  tx: Database,
): Promise<ShopifyStoreCredentials | null> {
  const r = await tx.execute<{
    shop_domain: string;
    client_id: string;
    ciphertext: Buffer;
    key_version: number;
  }>(
    sql`SELECT shop_domain, client_id, ciphertext, key_version FROM cf.read_shopify_store_credentials()`,
  );
  const row = r.rows[0];
  return row
    ? {
        shopDomain: row.shop_domain,
        clientId: row.client_id,
        ciphertext: row.ciphertext,
        keyVersion: row.key_version,
      }
    : null;
}

/** Ghi kết quả đồng bộ — CHỈ `withJob`. `token_invalid` hạ trạng thái xuống `invalid`. */
export async function recordShopifySync(
  tx: Database,
  result: ShopifySyncResult,
  summary: ShopifySyncDetail = {},
): Promise<void> {
  await tx.execute(
    sql`SELECT cf.record_shopify_sync(${result}, ${JSON.stringify(summary)}::jsonb)`,
  );
}
