import { AppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { readObservabilityConfig } from './config';

const KEY_VAR = 'LANGFUSE_SECRET_KEY';
const SECRET = ['sk', 'test'].join('-');

function fullEnv(): Record<string, string> {
  return {
    LANGFUSE_ENABLED: 'true',
    LANGFUSE_HOST: 'http://lf.test:3100/',
    LANGFUSE_PUBLIC_KEY: 'pk-test',
    [KEY_VAR]: SECRET,
  };
}

describe('FR-034 cấu hình quan sát từ biến môi trường', () => {
  it('mặc định TẮT cả hai cờ', () => {
    const c = readObservabilityConfig({});
    expect(c.multiProviderEnabled).toBe(false);
    expect(c.langfuse).toEqual({ enabled: false });
  });

  it('chỉ đúng chữ "true" mới bật', () => {
    expect(
      readObservabilityConfig({ LITELLM_MULTI_PROVIDER_ENABLED: 'TRUE' }).multiProviderEnabled,
    ).toBe(false);
    expect(
      readObservabilityConfig({ LITELLM_MULTI_PROVIDER_ENABLED: 'true' }).multiProviderEnabled,
    ).toBe(true);
  });

  it('Langfuse bật đủ biến → trả host (bỏ dấu / cuối) và khóa', () => {
    expect(readObservabilityConfig(fullEnv()).langfuse).toEqual({
      enabled: true,
      host: 'http://lf.test:3100',
      publicKey: 'pk-test',
      secretKey: SECRET,
    });
  });

  it.each(['LANGFUSE_HOST', 'LANGFUSE_PUBLIC_KEY', KEY_VAR])(
    'bật mà thiếu %s → CONFIG_INVALID nêu tên biến',
    (name) => {
      const env = fullEnv();
      delete env[name];
      try {
        readObservabilityConfig(env);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe('CONFIG_INVALID');
        expect((e as AppError).message).toContain(name);
        expect((e as AppError).message).not.toContain(SECRET);
      }
    },
  );

  it('host nhúng user:pass → CONFIG_INVALID', () => {
    expect(() =>
      readObservabilityConfig({ ...fullEnv(), LANGFUSE_HOST: 'https://u:p@lf.test' }),
    ).toThrow(/LANGFUSE_HOST/);
  });

  it('host không phải URL → CONFIG_INVALID', () => {
    expect(() =>
      readObservabilityConfig({ ...fullEnv(), LANGFUSE_HOST: 'khong-phai-url' }),
    ).toThrow(/LANGFUSE_HOST/);
  });
});
