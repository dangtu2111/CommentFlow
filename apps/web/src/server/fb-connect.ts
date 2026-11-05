import type {
  ChannelRef,
  EncryptedToken,
  FacebookOAuthClient,
  FacebookPageGrant,
  TokenContext,
} from '@flow/connectors';

/**
 * Nghiệp vụ "kết nối Page Facebook" sau khi Owner đã chọn Page (FR-010). Thuần: mọi thứ ngoài (Meta, DB, mã hóa) được
 * tiêm vào để test bằng mock; nơi gọi (`fb-connect-runtime`) đã kiểm Owner + phiên.
 *
 * THỨ TỰ (mỗi Page) — WEBHOOK-SUBSCRIBE-VERIFY, chống kênh mang Page ID của shop khác:
 *  1. đối chiếu `GET /me?fields=id` của Page token == Page ID đã chọn; lệch → DỪNG Page này (không tạo kênh, không lưu
 *     token, không đăng ký webhook);
 *  2. tạo/kết nối lại kênh + lưu token ĐÃ MÃ HÓA (AAD workspace|channel|key_version);
 *  3. đăng ký webhook ĐÍCH DANH (`POST /{external_id}/subscribed_apps` bằng chính Page token) và đọc lại để xác nhận;
 *  4. CHỈ SAU ĐÓ mới đặt `webhook_subscribed = true`.
 * Giới hạn gói kiểm TRƯỚC mọi thao tác ghi/gọi ghi. Không log; lỗi chỉ ra mã.
 */
export type FbConnectOutcome =
  | 'connected'
  /** Kênh + token đã lưu nhưng webhook chưa đăng ký được (có thể thử lại bằng "Kết nối lại"). */
  | 'connected_without_webhook'
  | 'identity_mismatch'
  | 'insufficient_permission'
  | 'failed';

export type FbConnectResult = { pageId: string; name: string; outcome: FbConnectOutcome };

export type FbConnectErrorCode = 'no_selection' | 'page_not_available' | 'limit_exceeded';
export class FbConnectError extends Error {
  constructor(readonly code: FbConnectErrorCode) {
    super(`fb_connect_${code}`);
    this.name = 'FbConnectError';
  }
}

export type FbChannelStore = {
  /** `external_id` của các kênh Facebook CHƯA bị ngắt (`status <> 'revoked'`) trong workspace. */
  listActiveExternalIds(): Promise<string[]>;
  /**
   * Tạo/kết nối lại kênh rồi lưu token: `sealToken` nhận `channelId` thật và trả ciphertext (mã hóa cần id làm AAD).
   * Phải chạy trong MỘT giao dịch với quyền Owner. Trả `channelId`.
   */
  saveChannel(
    page: { externalId: string; name: string; scopes: readonly string[] },
    sealToken: (channelId: string) => EncryptedToken,
  ): Promise<string>;
  /** Đặt `webhook_subscribed = true` (đường hệ thống, chỉ gọi sau khi đã xác nhận đăng ký). */
  markWebhookSubscribed(channelId: string): Promise<void>;
};

export type FbConnectDeps = {
  oauth: Pick<FacebookOAuthClient, 'listPages' | 'getTokenOwnerId'>;
  store: FbChannelStore;
  encrypt(plaintext: string, ctx: TokenContext): EncryptedToken;
  /** Đăng ký `subscribed_apps` cho đúng `channel.externalId` bằng `pageToken` rồi xác nhận lại; ném nếu không thành. */
  subscribeAndVerify(channel: ChannelRef, pageToken: string): Promise<void>;
  /** Số kênh tối đa của workspace. */
  limit: number;
  scopes: readonly string[];
  /** Ghi vết lỗi không PII (mã, không token). */
  warn?: (event: { event: string; pageId?: string; code?: string }) => void;
};

const MODERATING_TASKS = ['MANAGE', 'MODERATE'];
const hasModerationTask = (page: FacebookPageGrant) =>
  page.tasks.some((task) => MODERATING_TASKS.includes(task));

export async function listConnectablePages(
  deps: Pick<FbConnectDeps, 'oauth' | 'store'>,
  userToken: string,
): Promise<Array<{ id: string; name: string; connected: boolean; usable: boolean }>> {
  const [pages, active] = await Promise.all([
    deps.oauth.listPages(userToken),
    deps.store.listActiveExternalIds(),
  ]);
  const activeSet = new Set(active);
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    connected: activeSet.has(page.id),
    usable: hasModerationTask(page),
  }));
}

export async function connectFacebookPages(
  input: { workspaceId: string; userToken: string; selectedPageIds: readonly string[] },
  deps: FbConnectDeps,
): Promise<FbConnectResult[]> {
  const selected = [...new Set(input.selectedPageIds)];
  if (selected.length === 0) throw new FbConnectError('no_selection');

  // Danh sách Page đọc lại từ Meta bằng token của chính Owner: id từ form không tự cấp quyền.
  const granted = await deps.oauth.listPages(input.userToken);
  const byId = new Map(granted.map((page) => [page.id, page]));
  const chosen = selected.map((id) => byId.get(id));
  if (chosen.some((page) => page === undefined)) throw new FbConnectError('page_not_available');
  const pages = chosen as FacebookPageGrant[];

  const active = new Set(await deps.store.listActiveExternalIds());
  const added = pages.filter((page) => !active.has(page.id)).length;
  if (active.size + added > deps.limit) throw new FbConnectError('limit_exceeded');

  const results: FbConnectResult[] = [];
  for (const page of pages) {
    results.push({ pageId: page.id, name: page.name, outcome: await connectOne(page) });
  }
  return results;

  async function connectOne(page: FacebookPageGrant): Promise<FbConnectOutcome> {
    if (!hasModerationTask(page)) return 'insufficient_permission';
    try {
      // 1. Token này có thật là của Page đã chọn không?
      if ((await deps.oauth.getTokenOwnerId(page.accessToken)) !== page.id) {
        deps.warn?.({ event: 'fb_connect_identity_mismatch', pageId: page.id });
        return 'identity_mismatch';
      }
    } catch (error) {
      deps.warn?.({ event: 'fb_connect_identity_failed', pageId: page.id, code: codeOf(error) });
      return 'failed';
    }

    let channelId: string;
    try {
      // 2. Kênh + token mã hóa (một giao dịch Owner).
      channelId = await deps.store.saveChannel(
        { externalId: page.id, name: page.name, scopes: deps.scopes },
        (id) => deps.encrypt(page.accessToken, { workspaceId: input.workspaceId, channelId: id }),
      );
    } catch (error) {
      deps.warn?.({ event: 'fb_connect_save_failed', pageId: page.id, code: codeOf(error) });
      return 'failed';
    }

    try {
      // 3. Webhook đích danh + xác nhận; 4. đặt cờ.
      await deps.subscribeAndVerify(
        {
          id: channelId,
          workspaceId: input.workspaceId,
          platform: 'facebook',
          externalId: page.id,
        },
        page.accessToken,
      );
      await deps.store.markWebhookSubscribed(channelId);
      return 'connected';
    } catch (error) {
      deps.warn?.({ event: 'fb_connect_webhook_failed', pageId: page.id, code: codeOf(error) });
      return 'connected_without_webhook';
    }
  }
}

function codeOf(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown; name?: unknown };
  if (typeof e?.code === 'string') return e.code;
  return typeof e?.name === 'string' ? e.name : 'unknown';
}
