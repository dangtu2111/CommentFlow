import {
  createFacebookOAuthClient,
  createTokenCipher,
  FACEBOOK_OAUTH_SCOPES,
  type FacebookOAuthClient,
  parseTokenKeys,
} from '@flow/connectors';
import { createChannel, setChannelToken, sql } from '@flow/db/runtime';
import { getDb } from './db';
import { type FbChannelStore, type FbConnectDeps, FbConnectError } from './fb-connect';
import { type FbOAuthConfig, loadFbOAuthConfig } from './fb-oauth-env';
import { createSubscribeAndVerify } from './fb-subscribe';

/**
 * Nối nghiệp vụ kết nối Facebook với Meta + DB thật. Chỉ dùng khi `FB_OAUTH_ENABLED=true`. Nơi gọi PHẢI đã gọi
 * `requireAppUser({ role: 'owner' })` và truyền `workspaceId`/`userId` từ đó (không từ client).
 *
 * Quyền ghi: tạo kênh + lưu token đi qua `withActor` (hàm DEFINER tự kiểm Owner đang hoạt động — ADR 007 §2). Cột
 * `webhook_subscribed` chỉ ĐƯỜNG HỆ THỐNG đặt được (trigger `guard_channel_user_update`), nên bước cuối dùng
 * `withJob(workspaceId)` — chỉ chạy SAU khi đã xác nhận đăng ký webhook (xem `connectFacebookPages`).
 */
export type EnabledFbConfig = Extract<FbOAuthConfig, { enabled: true }>;

/** `null` khi cờ tắt. Cấu hình sai (bật mà thiếu biến) → ném lỗi cấu hình. */
export function getEnabledFbConfig(): EnabledFbConfig | null {
  const config = loadFbOAuthConfig();
  return config.enabled ? config : null;
}

export function buildFbOAuthClient(
  config: EnabledFbConfig,
  fetchImpl?: typeof fetch,
): FacebookOAuthClient {
  return createFacebookOAuthClient({
    appId: config.appId,
    appSecret: config.appSecret,
    redirectUri: config.redirectUri,
    ...(config.loginConfigId ? { loginConfigId: config.loginConfigId } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export function buildChannelStore(
  workspaceId: string,
  userId: string,
  limit = Number.POSITIVE_INFINITY,
): FbChannelStore {
  const db = getDb();
  return {
    async listActiveExternalIds() {
      const result = await db.withActor(workspaceId, userId, (tx) =>
        tx.execute<{ external_id: string }>(sql`
          SELECT external_id FROM cf.channels
           WHERE workspace_id = ${workspaceId}::uuid AND platform = 'facebook' AND status <> 'revoked'`),
      );
      return result.rows.map((row) => row.external_id);
    },
    saveChannel: (page, sealToken) =>
      db.withActor(workspaceId, userId, async (tx) => {
        // Chống vượt giới hạn do hai yêu cầu đồng thời: khóa theo workspace trong giao dịch, đếm lại rồi mới tạo.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`fb-channels:${workspaceId}`}))`,
        );
        const current = await tx.execute<{ external_id: string }>(sql`
          SELECT external_id FROM cf.channels
           WHERE workspace_id = ${workspaceId}::uuid AND platform = 'facebook' AND status <> 'revoked'`);
        const isNew = !current.rows.some((row) => row.external_id === page.externalId);
        if (isNew && current.rows.length >= limit) throw new FbConnectError('limit_exceeded');
        const channelId = await createChannel(tx, {
          platform: 'facebook',
          externalId: page.externalId,
          name: page.name,
          scopes: page.scopes,
        });
        const sealed = sealToken(channelId);
        // Page token lấy từ token người dùng dài hạn không có hạn → expiresAt = null.
        await setChannelToken(tx, {
          channelId,
          ciphertext: sealed.ciphertext,
          keyVersion: sealed.keyVersion,
          expiresAt: null,
        });
        return channelId;
      }),
    markWebhookSubscribed: (channelId) => setFlag(channelId, true),
    clearWebhookSubscribed: (channelId) => setFlag(channelId, false),
  };

  /** Đường hệ thống; 0 dòng bị đổi (kênh vừa bị ngắt/đổi trạng thái) → ném để không báo thành công sai. */
  async function setFlag(channelId: string, value: boolean): Promise<void> {
    const result = await db.withJob(workspaceId, (tx) =>
      tx.execute(sql`
        UPDATE cf.channels SET webhook_subscribed = ${value}, updated_at = now()
         WHERE id = ${channelId}::uuid AND workspace_id = ${workspaceId}::uuid
           AND platform = 'facebook' AND status = 'connected'`),
    );
    if (result.rowCount !== 1) throw new Error('channel_not_updated');
  }
}

export function buildConnectDeps(
  config: EnabledFbConfig,
  who: { workspaceId: string; userId: string },
  fetchImpl?: typeof fetch,
): FbConnectDeps {
  const cipher = createTokenCipher(parseTokenKeys(config.tokenEncKeys));
  return {
    oauth: buildFbOAuthClient(config, fetchImpl),
    store: buildChannelStore(who.workspaceId, who.userId, config.channelsLimit),
    encrypt: cipher.encrypt,
    subscribeAndVerify: createSubscribeAndVerify({
      appId: config.appId,
      appSecret: config.appSecret,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    }),
    limit: config.channelsLimit,
    scopes: FACEBOOK_OAUTH_SCOPES,
    warn: (event) => console.warn(JSON.stringify(event)),
  };
}
