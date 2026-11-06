import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { DATABASE_WORKER_URL: 'postgres://cf_worker:pw@localhost:5432/cf_test' };

describe('FR-094 cấu hình xuất dữ liệu của worker', () => {
  it('FR-094 mặc định TẮT; giá trị khác "true" cũng tắt', () => {
    expect(loadConfig(base).dataExport).toEqual({ enabled: false });
    expect(loadConfig({ ...base, DATA_EXPORT_ENABLED: '1' }).dataExport).toEqual({ enabled: false });
    expect(loadConfig({ ...base, DATA_EXPORT_ENABLED: 'TRUE' }).dataExport).toEqual({ enabled: false });
  });

  it('FR-094 bật cần DATA_EXPORT_DIR; thiếu thì lỗi cấu hình', () => {
    expect(() => loadConfig({ ...base, DATA_EXPORT_ENABLED: 'true' })).toThrow();
    expect(
      loadConfig({ ...base, DATA_EXPORT_ENABLED: 'true', DATA_EXPORT_DIR: ' /var/cf-exports ' })
        .dataExport,
    ).toEqual({ enabled: true, dir: '/var/cf-exports' });
  });
});
