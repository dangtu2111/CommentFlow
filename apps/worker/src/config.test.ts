import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('dùng giá trị mặc định khi không đặt biến', () => {
    expect(loadConfig({})).toEqual({ logLevel: 'info', port: 3001 });
  });

  it('đọc cổng và mức log từ biến môi trường', () => {
    expect(loadConfig({ WORKER_PORT: '3100', LOG_LEVEL: 'debug' })).toEqual({
      logLevel: 'debug',
      port: 3100,
    });
  });

  it('từ chối mức log không hợp lệ', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'ồn ào' })).toThrow(/LOG_LEVEL/);
  });
});
