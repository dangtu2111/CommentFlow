import { describe, expect, it, vi } from 'vitest';
import { resolveEmbeddingConfig } from './embedding-config';
import { ML_EMBEDDING_MODEL } from './ml-embedder';

/**
 * MỘT hàm cấu hình embedding duy nhất cho web, worker và EVAL; KHÔNG có mock khi chạy: thiếu cấu hình → `off`, không bao giờ trả embedder giả.
 */
describe('resolveEmbeddingConfig — nguồn duy nhất, không mock', () => {
  const on = { ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml:8000' };

  it('bật cờ + có ML_URL → bge-m3 qua dịch vụ ml', () => {
    const c = resolveEmbeddingConfig(on);
    expect(c.kind).toBe('ml');
    expect(c.model).toBe(ML_EMBEDDING_MODEL);
    expect(c.embedder?.model).toBe(ML_EMBEDDING_MODEL);
  });

  it('tắt, sai chữ, hoặc thiếu ML_URL → `off`: KHÔNG có embedder (không rơi về bản giả)', () => {
    for (const env of [
      {},
      { ML_EMBED_ENABLED: '1', ML_URL: 'http://ml' },
      { ML_EMBED_ENABLED: 'true' },
      { ML_URL: 'http://ml' },
      { ML_EMBED_ENABLED: 'false', ML_URL: 'http://ml' },
      { ML_EMBED_ENABLED: 'mock', ML_URL: 'http://ml', USE_MOCK_EMBEDDER: 'true' },
    ]) {
      const c = resolveEmbeddingConfig(env);
      expect(c.kind).toBe('off');
      expect(c.model).toBeNull();
      expect(c.embedder).toBeNull();
    }
  });

  it('cùng môi trường → cùng kết quả ở mọi lần gọi (web/worker/EVAL không thể lệch nhau)', () => {
    expect(resolveEmbeddingConfig(on).model).toBe(resolveEmbeddingConfig({ ...on }).model);
    expect(resolveEmbeddingConfig({}).kind).toBe(
      resolveEmbeddingConfig({ ML_EMBED_ENABLED: 'false' }).kind,
    );
  });

  it('mô tả cho log/báo cáo/giao diện: model + loại; khi tắt nêu rõ lý do; không lộ token', () => {
    const c = resolveEmbeddingConfig({ ...on, ML_API_TOKEN: 'bi-mat' });
    expect(c.describe).toMatchObject({ kind: 'ml', model: ML_EMBEDDING_MODEL });
    expect(JSON.stringify(c.describe)).not.toContain('bi-mat');
    expect(resolveEmbeddingConfig({}).describe.note).toContain('ML_EMBED_ENABLED');
  });
});

describe('chốt chặn: embedder giả chỉ cho test tự động', () => {
  it('tiến trình KHÔNG phải test (web/worker) nạp embedder giả → lỗi ngay', async () => {
    vi.stubEnv('VITEST', undefined as never);
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const { createFixtureEmbedder } = await import('./fixture-embedder');
      const { createMockEmbedder } = await import('../kb-indexing');
      expect(() => createFixtureEmbedder()).toThrow(/createFixtureEmbedder/);
      expect(() => createMockEmbedder()).toThrow(/createMockEmbedder/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('trong test (vitest) nạp được; test tự cắm qua tham số', async () => {
    const { createFixtureEmbedder } = await import('./fixture-embedder');
    expect(createFixtureEmbedder().model).toContain('fixture');
  });
});
