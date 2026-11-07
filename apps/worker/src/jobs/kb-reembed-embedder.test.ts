import { ML_EMBEDDING_MODEL } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { pickReembedEmbedder } from './kb-reembed-embedder';

const baseEnv = {
  DATABASE_WORKER_URL: 'postgres://cf_worker:pw@localhost:5432/cf_dev',
};

describe('FR-133 chọn embedder cho kb-reembed', () => {
  it('không bật ml → mock (không gọi mạng)', () => {
    const config = loadConfig(baseEnv);
    expect(config.mlEmbedder).toBeUndefined();
    expect(pickReembedEmbedder(config).model).not.toBe(ML_EMBEDDING_MODEL);
  });

  it('ML_EMBED_ENABLED=true + ML_URL → bge-m3 qua dịch vụ ml; cờ khác "true" hoặc thiếu URL → mock', () => {
    const on = loadConfig({ ...baseEnv, ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml:8000' });
    expect(on.mlEmbedder).toEqual({ baseUrl: 'http://ml:8000' });
    expect(pickReembedEmbedder(on).model).toBe(ML_EMBEDDING_MODEL);
    expect(
      loadConfig({ ...baseEnv, ML_EMBED_ENABLED: '1', ML_URL: 'http://ml' }).mlEmbedder,
    ).toBeUndefined();
    expect(loadConfig({ ...baseEnv, ML_EMBED_ENABLED: 'true' }).mlEmbedder).toBeUndefined();
  });
});
