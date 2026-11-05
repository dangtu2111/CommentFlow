import { parseEnv } from '@flow/shared';
import { z } from 'zod';

/**
 * Cấu hình kết nối Facebook (FB-OAUTH). Cờ `FB_OAUTH_ENABLED` MẶC ĐỊNH TẮT (chỉ đúng chữ `true` mới bật): tắt thì
 * không đọc biến nào khác và mọi đường dùng Meta thật trả 404. Bật mà thiếu/sai biến → ném lỗi cấu hình (nêu tên
 * biến, không giá trị). Dùng lại tên `META_*` sẵn có (cùng một Meta App với webhook) — xem QUYET_DINH Q5.
 */
export type FbOAuthConfig =
  | { enabled: false }
  | {
      enabled: true;
      appId: string;
      appSecret: string;
      redirectUri: string;
      loginConfigId: string | undefined;
      tokenEncKeys: string;
      /** Số kênh tối đa mỗi workspace (chưa có bảng `plans` → mặc định 1 = gói thử). */
      channelsLimit: number;
    };

const schema = z.object({
  META_APP_ID: z.string().regex(/^[0-9]{5,30}$/),
  META_APP_SECRET: z.string().trim().min(16),
  META_OAUTH_REDIRECT_URL: z.url(),
  FB_LOGIN_CONFIG_ID: z
    .string()
    .regex(/^[0-9]{1,30}$/)
    .optional(),
  TOKEN_ENC_KEYS: z.string().trim().min(1),
  CHANNELS_LIMIT_DEFAULT: z.coerce.number().int().min(1).max(1000).default(1),
});

export function loadFbOAuthConfig(
  source: Record<string, string | undefined> = process.env,
): FbOAuthConfig {
  if (source.FB_OAUTH_ENABLED?.trim() !== 'true') return { enabled: false };
  const blank = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
  const env = parseEnv(schema, {
    META_APP_ID: blank(source.META_APP_ID),
    META_APP_SECRET: blank(source.META_APP_SECRET),
    META_OAUTH_REDIRECT_URL: blank(source.META_OAUTH_REDIRECT_URL),
    FB_LOGIN_CONFIG_ID: blank(source.FB_LOGIN_CONFIG_ID),
    TOKEN_ENC_KEYS: blank(source.TOKEN_ENC_KEYS),
    CHANNELS_LIMIT_DEFAULT: blank(source.CHANNELS_LIMIT_DEFAULT),
  });
  return {
    enabled: true,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_OAUTH_REDIRECT_URL,
    loginConfigId: env.FB_LOGIN_CONFIG_ID,
    tokenEncKeys: env.TOKEN_ENC_KEYS,
    channelsLimit: env.CHANNELS_LIMIT_DEFAULT,
  };
}
