import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = { DATABASE_WORKER_URL: 'postgres://cf_worker:pw@localhost:5432/cf_test' };

describe('FR-133 cờ tạo lại embedding của worker', () => {
  it('mặc định TẮT; chỉ đúng chữ "true" mới bật', () => {
    expect(loadConfig(base).kbReembedEnabled).toBe(false);
    expect(loadConfig({ ...base, KB_REEMBED_ENABLED: '1' }).kbReembedEnabled).toBe(false);
    expect(loadConfig({ ...base, KB_REEMBED_ENABLED: 'TRUE' }).kbReembedEnabled).toBe(false);
    expect(loadConfig({ ...base, KB_REEMBED_ENABLED: 'true' }).kbReembedEnabled).toBe(true);
  });
});
