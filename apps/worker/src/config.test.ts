import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const DATABASE_WORKER_URL = 'postgresql://cf_worker:matkhau@localhost:5433/cf_dev';

describe('loadConfig', () => {
  it('dùng giá trị mặc định cho cổng và mức log', () => {
    expect(loadConfig({ DATABASE_WORKER_URL })).toEqual({
      logLevel: 'info',
      port: 3001,
      databaseUrl: DATABASE_WORKER_URL,
      tokenEncKeys: undefined,
    });
  });

  it('đọc TOKEN_ENC_KEYS (tùy chọn) nguyên văn', () => {
    expect(loadConfig({ DATABASE_WORKER_URL, TOKEN_ENC_KEYS: 'v1:abc' }).tokenEncKeys).toBe(
      'v1:abc',
    );
  });

  it('đọc cổng và mức log từ biến môi trường', () => {
    expect(
      loadConfig({ DATABASE_WORKER_URL, WORKER_PORT: '3100', LOG_LEVEL: 'debug' }),
    ).toMatchObject({ logLevel: 'debug', port: 3100 });
  });

  it('từ chối mức log không hợp lệ', () => {
    expect(() => loadConfig({ DATABASE_WORKER_URL, LOG_LEVEL: 'ồn ào' })).toThrow(/LOG_LEVEL/);
  });

  it('thiếu DATABASE_WORKER_URL → CONFIG_INVALID, thông báo chỉ nêu tên biến, không lộ giá trị', () => {
    try {
      loadConfig({ DATABASE_WORKER_URL: '' });
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
      expect((error as Error).message).toContain('DATABASE_WORKER_URL');
    }
  });

  it('không dùng DATABASE_URL (role web cf_app) thay cho URL worker', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgresql://cf_app:matkhau@localhost:5433/cf_dev' }),
    ).toThrow(/DATABASE_WORKER_URL/);
  });

  it('từ chối URL worker không đăng nhập bằng role cf_worker, không lộ mật khẩu', () => {
    for (const url of [
      'postgresql://cf_app:bimat123@localhost:5433/cf_dev',
      'postgresql://cf_owner:bimat123@localhost:5433/cf_dev',
      'không phải url bimat123',
    ]) {
      try {
        loadConfig({ DATABASE_WORKER_URL: url });
        expect.unreachable();
      } catch (error) {
        expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
        expect((error as Error).message).toContain('DATABASE_WORKER_URL');
        expect((error as Error).message).not.toContain('bimat123');
      }
    }
  });
});
