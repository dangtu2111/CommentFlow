import {
  parseShopifyClientId,
  parseShopifyClientSecret,
  parseShopifyDomain,
} from '../lib/shopify-connect-form';

export type ShopifySession = { workspaceId: string; userId: string };

export type ShopifyConnectResult =
  | 'ok'
  | 'invalid'
  | 'not_configured'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_credentials'
  | 'not_permitted'
  | 'missing_scopes'
  | 'unreachable';

/** Kết quả thử đổi token ngay khi lưu (chỉ khi bật đồng bộ Shopify). `scope` = danh sách quyền token được cấp. */
export type ShopifyVerifyResult =
  | { status: 'ok'; scope: string }
  | { status: 'invalid_credentials' | 'not_permitted' | 'unreachable' };

/** Quyền tối thiểu để đọc sản phẩm; thiếu thì không lưu (giống dự án tham chiếu: kiểm tra trước khi lưu). */
const REQUIRED_SCOPE = 'read_products';
export type ShopifySyncRequestResult = 'queued' | 'recent' | 'forbidden' | 'unavailable';
export type ShopifyDisconnectResult = 'ok' | 'not_found' | 'forbidden' | 'unavailable';

export type ShopifyConnectDeps = {
  /** Mã hóa Client secret (AES-GCM, AAD = workspace + khóa "shopify"); `undefined` khi máy chủ chưa có `TOKEN_ENC_KEYS`. */
  encrypt:
    | ((secret: string, ctx: { workspaceId: string }) => { ciphertext: Buffer; keyVersion: number })
    | undefined;
  save: (
    session: ShopifySession,
    input: { shopDomain: string; clientId: string; ciphertext: Buffer; keyVersion: number },
  ) => Promise<void>;
  /**
   * Thử đổi Client ID/secret lấy token NGAY khi lưu để báo lỗi tại chỗ (sai cặp, khác tổ chức, thiếu quyền) thay vì thất
   * bại ngầm ở job. `undefined` khi đồng bộ Shopify đang tắt (`SHOPIFY_ENABLED`) → lưu không gọi Shopify.
   */
  verify?:
    | ((input: {
        shopDomain: string;
        clientId: string;
        clientSecret: string;
      }) => Promise<ShopifyVerifyResult>)
    | undefined;
  disconnect: (session: ShopifySession) => Promise<void>;
  /** Giữ thời gian chờ nguyên tử ở DB (`cf.request_shopify_sync`): `true` = được đẩy job ngay. */
  requestSync: (session: ShopifySession) => Promise<boolean>;
  enqueue: (job: { workspaceId: string }) => Promise<void>;
  warn: (event: { event: string; reason: string }) => void;
};

const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;

/**
 * Dịch vụ kết nối Shopify của web (SHOPIFY-CONNECT-STORE). Quyền do DB quyết định (hàm DEFINER chỉ Owner): ở đây chỉ kiểm
 * đầu vào, mã hóa Client secret và dịch mã lỗi. Không log secret, tên miền hay nội dung lỗi (có thể chứa token). Workspace luôn từ
 * phiên của người gọi, không từ form.
 */
export function createShopifyConnectService(deps: ShopifyConnectDeps) {
  return {
    async connect(
      session: ShopifySession,
      domainInput: string,
      clientIdInput: string,
      clientSecretInput: string,
    ): Promise<ShopifyConnectResult> {
      const shopDomain = parseShopifyDomain(domainInput);
      const clientId = parseShopifyClientId(clientIdInput);
      const clientSecret = parseShopifyClientSecret(clientSecretInput);
      if (!shopDomain || !clientId || !clientSecret) return 'invalid';
      if (!deps.encrypt) return 'not_configured';
      if (deps.verify) {
        let verified: ShopifyVerifyResult;
        try {
          verified = await deps.verify({ shopDomain, clientId, clientSecret });
        } catch (error) {
          deps.warn({ event: 'shopify_verify_failed', reason: codeOf(error) ?? 'unknown' });
          return 'unreachable';
        }
        if (verified.status !== 'ok') return verified.status;
        if (!verified.scope.split(',').includes(REQUIRED_SCOPE)) return 'missing_scopes';
      }
      try {
        const { ciphertext, keyVersion } = deps.encrypt(clientSecret, {
          workspaceId: session.workspaceId,
        });
        await deps.save(session, { shopDomain, clientId, ciphertext, keyVersion });
        return 'ok';
      } catch (error) {
        if (codeOf(error) === '42501') return 'forbidden';
        deps.warn({ event: 'shopify_connect_failed', reason: codeOf(error) ?? 'unknown' });
        return 'unavailable';
      }
    },

    async sync(session: ShopifySession): Promise<ShopifySyncRequestResult> {
      try {
        if (!(await deps.requestSync(session))) return 'recent';
        await deps.enqueue({ workspaceId: session.workspaceId });
        return 'queued';
      } catch (error) {
        if (codeOf(error) === '42501') return 'forbidden';
        deps.warn({ event: 'shopify_sync_enqueue_failed', reason: codeOf(error) ?? 'unknown' });
        return 'unavailable';
      }
    },

    async disconnect(session: ShopifySession): Promise<ShopifyDisconnectResult> {
      try {
        await deps.disconnect(session);
        return 'ok';
      } catch (error) {
        const code = codeOf(error);
        if (code === 'P0002') return 'not_found';
        if (code === '42501') return 'forbidden';
        deps.warn({ event: 'shopify_disconnect_failed', reason: code ?? 'unknown' });
        return 'unavailable';
      }
    },
  };
}
