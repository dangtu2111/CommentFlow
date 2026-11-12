import {
  createFacebookOAuthClient,
  createTokenCipher,
  type FacebookOAuthClient,
  parseTokenKeys,
} from '@flow/connectors';
import {
  createChannel,
  disconnectFbSystemConnection,
  markFbSystemConnectionInvalid,
  readFbSystemConnectionToken,
  saveFbSystemConnection,
  setChannelToken,
  sql,
} from '@flow/db/runtime';
import { FB_SYSTEM_TOKEN_KEY } from '@flow/shared';
import { getDb } from './db';
import { type FbChannelStore, type FbConnectDeps, FbConnectError } from './fb-connect';
import { type FbOAuthConfig, loadFbOAuthConfig } from './fb-oauth-env';
import { createSubscribeAndVerify } from './fb-subscribe';
import { createFbSystemUserService, type FbSystemUserVerifyResult } from './fb-system-user';

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
    warn: (event) => console.warn(JSON.stringify(event)),
  };
}

const SYSTEM_USER_REQUIRED_SCOPE = 'pages_show_list';

/**
 * Dịch vụ token System User (CHANNELS-SYSTEM-USER) nối DB + Meta thật. Nơi gọi PHẢI đã gọi `requireAppUser({ role: 'owner' })`.
 * Mọi thao tác đi qua `withActor` (DB tự kiểm Owner, migration 0086/0087): web chỉ có kết nối cf_app nên `withJob` không phải
 * ngữ cảnh hệ thống (ADR 011). Mã hóa dùng `TOKEN_ENC_KEYS` cùng token Page; thiếu khóa → `encrypt = undefined`.
 */
export function buildFbSystemUserService(config: EnabledFbConfig, fetchImpl?: typeof fetch) {
  const db = getDb();
  const oauth = buildFbOAuthClient(config, fetchImpl);
  let cipher: ReturnType<typeof createTokenCipher> | undefined;
  try {
    cipher = createTokenCipher(parseTokenKeys(config.tokenEncKeys));
  } catch {
    cipher = undefined;
  }
  const verify = async (token: string): Promise<FbSystemUserVerifyResult> => {
    try {
      const info = await oauth.debugToken(token);
      if (!info.valid) return { status: 'invalid_credentials' };
      return info.scopes.includes(SYSTEM_USER_REQUIRED_SCOPE)
        ? { status: 'ok' }
        : { status: 'missing_scopes' };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      return {
        status:
          code === 'TOKEN_EXPIRED' || code === 'PERMISSION' ? 'invalid_credentials' : 'unreachable',
      };
    }
  };
  return createFbSystemUserService({
    encrypt: cipher
      ? (token, ctx) =>
          cipher.encrypt(token, { workspaceId: ctx.workspaceId, channelId: FB_SYSTEM_TOKEN_KEY })
      : undefined,
    decrypt: (sealed, ctx) => {
      if (!cipher) throw new Error('no_cipher');
      return cipher.decrypt(sealed.ciphertext, sealed.keyVersion, {
        workspaceId: ctx.workspaceId,
        channelId: FB_SYSTEM_TOKEN_KEY,
      });
    },
    verify,
    save: (session, sealed) =>
      db.withActor(session.workspaceId, session.userId, (tx) => saveFbSystemConnection(tx, sealed)),
    readCipher: (session) =>
      db
        .withActor(session.workspaceId, session.userId, (tx) => readFbSystemConnectionToken(tx))
        .then((row) => (row ? { ciphertext: row.ciphertext, keyVersion: row.keyVersion } : null)),
    markInvalid: (session) =>
      db.withActor(session.workspaceId, session.userId, (tx) => markFbSystemConnectionInvalid(tx)),
    disconnect: (session) =>
      db.withActor(session.workspaceId, session.userId, (tx) => disconnectFbSystemConnection(tx)),
    warn: (event) => console.error(JSON.stringify(event)),
  });
}
