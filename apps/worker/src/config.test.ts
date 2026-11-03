import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const DATABASE_URL = 'postgresql://cf_app:matkhau@localhost:5433/cf_dev';

describe('loadConfig', () => {
  it('dùng giá trị mặc định cho cổng và mức log', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      logLevel: 'info',
      port: 3001,
      databaseUrl: DATABASE_URL,
    });
  });

  it('đọc cổng và mức log từ biến môi trường', () => {
    expect(loadConfig({ DATABASE_URL, WORKER_PORT: '3100', LOG_LEVEL: 'debug' })).toMatchObject({
      logLevel: 'debug',
      port: 3100,
    });
  });

  it('từ chối mức log không hợp lệ', () => {
    expect(() => loadConfig({ DATABASE_URL, LOG_LEVEL: 'ồn ào' })).toThrow(/LOG_LEVEL/);
  });

  it('thiếu DATABASE_URL → CONFIG_INVALID, thông báo chỉ nêu tên biến, không lộ giá trị', () => {
    try {
      loadConfig({ DATABASE_URL: '' });
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
      expect((error as Error).message).toContain('DATABASE_URL');
    }
  });
});
