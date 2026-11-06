import { AppError } from '@flow/shared';

/** Cấu hình quan sát đọc từ biến môi trường (chỉ TÊN biến nằm trong `env.example`). Cờ chỉ bật khi đúng chữ `true`. */
export type LangfuseConfig =
  | { enabled: false }
  | { enabled: true; host: string; publicKey: string; secretKey: string };

export type ObservabilityConfig = {
  multiProviderEnabled: boolean;
  langfuse: LangfuseConfig;
};

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) {
    throw new AppError('CONFIG_INVALID', `Thiếu biến môi trường ${name} (Langfuse đang bật).`);
  }
  return value;
}

function normalizeHost(raw: string): string {
  const invalid = new AppError('CONFIG_INVALID', 'LANGFUSE_HOST không phải URL hợp lệ.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid;
  }
  // Không chấp nhận khóa nhúng trong URL (user:pass@host) — sẽ đi theo URL vào lỗi/log.
  if (url.username || url.password) throw invalid;
  return url.toString().replace(/\/+$/, '');
}

export function readObservabilityConfig(env: Env): ObservabilityConfig {
  const multiProviderEnabled = env.LITELLM_MULTI_PROVIDER_ENABLED === 'true';
  if (env.LANGFUSE_ENABLED !== 'true')
    return { multiProviderEnabled, langfuse: { enabled: false } };
  const host = normalizeHost(required(env, 'LANGFUSE_HOST'));
  const publicKey = required(env, 'LANGFUSE_PUBLIC_KEY');
  const secretKey = required(env, 'LANGFUSE_SECRET_KEY');
  return { multiProviderEnabled, langfuse: { enabled: true, host, publicKey, secretKey } };
}
