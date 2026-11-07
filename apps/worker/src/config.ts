import { parseEnv } from '@flow/shared';
import { z } from 'zod';

/** Tên role đăng nhập của worker — khớp migration 0030 (`session_user = 'cf_worker'`). */
const WORKER_ROLE = 'cf_worker';

function isWorkerRoleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    // `?user=` ghi đè tên trong URL ở thư viện pg → từ chối để khỏi kết nối nhầm role.
    return decodeURIComponent(url.username) === WORKER_ROLE && !url.searchParams.has('user');
  } catch {
    return false;
  }
}

const envShape = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WORKER_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  /**
   * Chuỗi kết nối role worker (`cf_worker`, migration 0030): đường DUY NHẤT được coi là "hệ thống" và đọc được ciphertext
   * token (ADR 011). KHÔNG phải DATABASE_URL (cf_app, của web) hay DATABASE_ADMIN_URL. Chỉ kiểm tên người dùng ở đây
   * (thông báo lỗi không kèm giá trị để khỏi lộ mật khẩu).
   */
  DATABASE_WORKER_URL: z
    .string()
    .min(1)
    .refine(isWorkerRoleUrl, 'phải đăng nhập bằng role cf_worker'),
  /** `v1:<64 hex>,v2:<…>` (docs/13 §5). Chưa cần khi chưa có kênh nào có token; có kênh mà thiếu → worker không khởi động. */
  TOKEN_ENC_KEYS: z.string().optional(),
  /** FR-023: quét bù gọi Meta THẬT — cờ MẶC ĐỊNH TẮT; chỉ đúng chữ `true` mới bật (như FB_OAUTH_ENABLED). */
  POLLING_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  /** FR-094: job xóa vĩnh viễn workspace đã tới hạn — cờ MẶC ĐỊNH TẮT; chỉ đúng chữ `true` mới bật. */
  WORKSPACE_DELETE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
});

const envSchema = envShape.superRefine((env, ctx) => {
  if (!env.POLLING_ENABLED) return;
  for (const name of ['META_APP_ID', 'META_APP_SECRET'] as const) {
    if (!env[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'bắt buộc khi bật' });
  }
});

/**
 * Connector Facebook (FB-CONNECTOR-REGISTER). Cờ `FB_CONNECTOR_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true` mới bật): tắt thì
 * không đọc biến nào khác và sổ connector rỗng như trước. Bật thì dùng lại `META_APP_*` (cùng Meta App với web) +
 * `TOKEN_ENC_KEYS` (bắt buộc để giải mã token Page).
 */
const facebookSchema = z.object({
  META_APP_ID: z.string().regex(/^[0-9]{5,30}$/),
  META_APP_SECRET: z.string().trim().min(16),
  TOKEN_ENC_KEYS: z.string().trim().min(1),
});

export type FacebookConnectorConfig =
  | { enabled: false }
  | { enabled: true; appId: string; appSecret: string };

function loadFacebookConfig(source: Record<string, string | undefined>): FacebookConnectorConfig {
  return loadMetaConnectorConfig(source, 'FB_CONNECTOR_ENABLED');
}

/**
 * Connector Instagram (IG-CONNECTOR, FR-013): cờ `IG_CONNECTOR_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true` mới bật), cùng Meta
 * App và cùng biến với Facebook (Q-IG1). Cờ độc lập với `FB_CONNECTOR_ENABLED`.
 */
export type InstagramConnectorConfig = FacebookConnectorConfig;

function loadInstagramConfig(source: Record<string, string | undefined>): InstagramConnectorConfig {
  return loadMetaConnectorConfig(source, 'IG_CONNECTOR_ENABLED');
}

/**
 * Gửi tin Messenger (MESSENGER-WEBHOOK, FR-014): cờ `MESSENGER_CONNECTOR_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true` mới
 * bật), cùng Meta App/biến với Facebook; độc lập với `FB_CONNECTOR_ENABLED`.
 */
export type MessengerConnectorConfig = FacebookConnectorConfig;

function loadMessengerConfig(source: Record<string, string | undefined>): MessengerConnectorConfig {
  return loadMetaConnectorConfig(source, 'MESSENGER_CONNECTOR_ENABLED');
}

/**
 * Connector TikTok (TIKTOK-CONNECTOR, FR-015): cờ `TIKTOK_CONNECTOR_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true` mới bật).
 * Bật thì cần `TIKTOK_CLIENT_SECRET` (xác minh chữ ký webhook) và `TOKEN_ENC_KEYS` (giải mã token kênh).
 */
const tiktokSchema = z.object({
  TIKTOK_CLIENT_SECRET: z.string().trim().min(16),
  TOKEN_ENC_KEYS: z.string().trim().min(1),
});

export type TikTokConnectorConfig = { enabled: false } | { enabled: true; clientSecret: string };

function loadTikTokConfig(source: Record<string, string | undefined>): TikTokConnectorConfig {
  if (source.TIKTOK_CONNECTOR_ENABLED?.trim() !== 'true') return { enabled: false };
  const blank = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
  const env = parseEnv(tiktokSchema, {
    TIKTOK_CLIENT_SECRET: blank(source.TIKTOK_CLIENT_SECRET),
    TOKEN_ENC_KEYS: blank(source.TOKEN_ENC_KEYS),
  });
  return { enabled: true, clientSecret: env.TIKTOK_CLIENT_SECRET };
}

function loadMetaConnectorConfig(
  source: Record<string, string | undefined>,
  flag: 'FB_CONNECTOR_ENABLED' | 'IG_CONNECTOR_ENABLED' | 'MESSENGER_CONNECTOR_ENABLED',
): FacebookConnectorConfig {
  if (source[flag]?.trim() !== 'true') return { enabled: false };
  const blank = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
  const env = parseEnv(facebookSchema, {
    META_APP_ID: blank(source.META_APP_ID),
    META_APP_SECRET: blank(source.META_APP_SECRET),
    TOKEN_ENC_KEYS: blank(source.TOKEN_ENC_KEYS),
  });
  return { enabled: true, appId: env.META_APP_ID, appSecret: env.META_APP_SECRET };
}

/**
 * Xuất dữ liệu workspace (DATA-EXPORT, FR-094): cờ `DATA_EXPORT_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true` mới bật).
 * Tắt thì worker không đăng ký hàng đợi `data-export`. Bật thì bắt buộc `DATA_EXPORT_DIR` (thư mục ghi tệp xuất cục bộ,
 * chờ object storage — gap DATA-EXPORT-DELIVERY).
 */
export type DataExportConfig = { enabled: false } | { enabled: true; dir: string };

function loadDataExportConfig(source: Record<string, string | undefined>): DataExportConfig {
  if (source.DATA_EXPORT_ENABLED?.trim() !== 'true') return { enabled: false };
  const env = parseEnv(z.object({ DATA_EXPORT_DIR: z.string().trim().min(1) }), {
    DATA_EXPORT_DIR: source.DATA_EXPORT_DIR?.trim() || undefined,
  });
  return { enabled: true, dir: env.DATA_EXPORT_DIR };
}

export type WorkerConfig = {
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  port: number;
  databaseUrl: string;
  tokenEncKeys: string | undefined;
  pollingEnabled: boolean;
  metaAppId: string | undefined;
  metaAppSecret: string | undefined;
  facebook: FacebookConnectorConfig;
  workspaceDeleteEnabled: boolean;
  instagram: InstagramConnectorConfig;
  dataExport: DataExportConfig;
  /** FR-133: cờ `KB_REEMBED_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true`); tắt → không đăng ký hàng đợi `kb-reembed`. */
  kbReembedEnabled: boolean;
  messenger: MessengerConnectorConfig;
  tiktok: TikTokConnectorConfig;
  /** Đồng bộ Shopify thật: cờ `SHOPIFY_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true`); bật thì cần `TOKEN_ENC_KEYS`. */
  shopify: { enabled: boolean; apiVersion: string | undefined };
};

export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  const env = parseEnv(envSchema, source);
  return {
    logLevel: env.LOG_LEVEL,
    port: env.WORKER_PORT,
    databaseUrl: env.DATABASE_WORKER_URL,
    tokenEncKeys: env.TOKEN_ENC_KEYS,
    pollingEnabled: env.POLLING_ENABLED,
    metaAppId: env.META_APP_ID,
    metaAppSecret: env.META_APP_SECRET,
    facebook: loadFacebookConfig(source),
    workspaceDeleteEnabled: env.WORKSPACE_DELETE_ENABLED,
    instagram: loadInstagramConfig(source),
    dataExport: loadDataExportConfig(source),
    kbReembedEnabled: source.KB_REEMBED_ENABLED?.trim() === 'true',
    messenger: loadMessengerConfig(source),
    tiktok: loadTikTokConfig(source),
    shopify: {
      enabled: source.SHOPIFY_ENABLED?.trim() === 'true',
      apiVersion: source.SHOPIFY_API_VERSION?.trim() || undefined,
    },
  };
}
