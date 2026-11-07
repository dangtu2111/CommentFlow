import { describe, expect, it, vi } from 'vitest';
import {
  createEmbeddingResolver,
  loadEmbeddingService,
  resolveEmbeddingConfig,
} from './embedding-config';

/**
 * Cấu hình embedding (FR-133, bổ sung 08/11): model hoạt động lấy từ DB; env chỉ bật/tắt dịch vụ ml (ML_EMBED_ENABLED/ML_URL/ML_API_TOKEN).
 * KHÔNG có mock khi chạy: thiếu dịch vụ hoặc chưa kích hoạt model → `off`, không bao giờ trả embedder giả.
 */
describe('resolveEmbeddingConfig — model từ DB, dịch vụ từ env', () => {
  const service = { baseUrl: 'http://ml:8000' };

  it('có dịch vụ + model hoạt động → ml với đúng model của DB', () => {
    const c = resolveEmbeddingConfig(service, 'bge-m3');
    expect(c.kind).toBe('ml');
    expect(c.model).toBe('bge-m3');
    expect(c.embedder?.model).toBe('bge-m3');
    const other = resolveEmbeddingConfig(service, 'bge-m3-v2');
    expect(other.model).toBe('bge-m3-v2'); // env không chọn model: DB quyết định
  });

  it('không có dịch vụ → off (service_disabled), không có embedder', () => {
    const c = resolveEmbeddingConfig(undefined, 'bge-m3');
    expect(c).toMatchObject({
      kind: 'off',
      reason: 'service_disabled',
      model: null,
      embedder: null,
    });
    expect(c.describe.note).toContain('ML_EMBED_ENABLED');
  });

  it('có dịch vụ nhưng DB chưa kích hoạt model → off (no_active_model), nêu cách sửa', () => {
    const c = resolveEmbeddingConfig(service, null);
    expect(c).toMatchObject({ kind: 'off', reason: 'no_active_model', embedder: null });
    expect(c.describe.note).toContain('kb:switch-embedding');
  });

  it('mô tả không lộ token/URL', () => {
    const c = resolveEmbeddingConfig({ ...service, token: 'bi-mat' }, 'bge-m3');
    expect(JSON.stringify(c.describe)).not.toContain('bi-mat');
    expect(JSON.stringify(c.describe)).not.toContain('http://ml');
  });
});

describe('loadEmbeddingService — env chỉ bật/tắt dịch vụ', () => {
  it('bật cờ đúng chữ true + ML_URL → dịch vụ (kèm token nếu có); còn lại → undefined', () => {
    expect(loadEmbeddingService({ ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml' })).toEqual({
      baseUrl: 'http://ml',
    });
    expect(
      loadEmbeddingService({ ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml', ML_API_TOKEN: 't' }),
    ).toEqual({ baseUrl: 'http://ml', token: 't' });
    for (const env of [
      {},
      { ML_EMBED_ENABLED: '1', ML_URL: 'http://ml' },
      { ML_EMBED_ENABLED: 'true' },
      { ML_URL: 'http://ml' },
      { ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml', EMBEDDING_MODEL: 'khac', ML_MODEL: 'khac' },
    ]) {
      const s = loadEmbeddingService(env);
      expect(s === undefined || s.baseUrl === 'http://ml').toBe(true);
    }
    expect(
      loadEmbeddingService({ ML_EMBED_ENABLED: 'false', ML_URL: 'http://ml' }),
    ).toBeUndefined();
  });
});

describe('createEmbeddingResolver — đọc model hoạt động từ DB, nhớ ngắn hạn', () => {
  it('không có dịch vụ → không đọc DB', async () => {
    const read = vi.fn(async () => ({ activeModel: 'bge-m3', revision: 1 }));
    const r = createEmbeddingResolver({ service: undefined });
    expect((await r.resolve(read)).config.kind).toBe('off');
    expect(read).not.toHaveBeenCalled();
  });

  it('nhớ trong ttl; hết hạn đọc lại; đổi model ở DB → embedder đổi theo', async () => {
    let now = 0;
    let active: string | null = 'm1';
    let revision = 1;
    const read = vi.fn(async () => ({ activeModel: active, revision }));
    const r = createEmbeddingResolver({
      service: { baseUrl: 'http://ml' },
      ttlMs: 1000,
      now: () => now,
    });
    expect((await r.resolve(read)).config.model).toBe('m1');
    expect((await r.resolve(read)).config.model).toBe('m1');
    expect(read).toHaveBeenCalledTimes(1);
    now = 1500;
    active = 'm2';
    revision = 2;
    const next = await r.resolve(read);
    expect(next.config.model).toBe('m2');
    expect(next.revision).toBe(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('lỗi đọc DB → ném lỗi (nơi gọi suy giảm về toàn văn), không đoán model', async () => {
    const r = createEmbeddingResolver({ service: { baseUrl: 'http://ml' } });
    await expect(
      r.resolve(async () => {
        throw new Error('db down');
      }),
    ).rejects.toThrow('db down');
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
