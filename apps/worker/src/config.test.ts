import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const DATABASE_WORKER_URL = 'postgresql://cf_worker:matkhau@localhost:5433/cf_dev';

describe('loadConfig', () => {
  it('dùng giá trị mặc định cho cổng và mức log', () => {
    const { embedding, ...rest } = loadConfig({ DATABASE_WORKER_URL });
    expect(embedding.kind).toBe('off'); // mặc định tắt cờ → TẮT, không có embedder giả (chi tiết ở test cấu hình embedding)
    expect(rest).toEqual({
      logLevel: 'info',
      port: 3001,
      databaseUrl: DATABASE_WORKER_URL,
      tokenEncKeys: undefined,
      pollingEnabled: false,
      metaAppId: undefined,
      metaAppSecret: undefined,
      facebook: { enabled: false },
      workspaceDeleteEnabled: false,
      instagram: { enabled: false },
      dataExport: { enabled: false },
      kbReembedEnabled: false,
      messenger: { enabled: false },
      tiktok: { enabled: false },
      shopify: { enabled: false, apiVersion: undefined },
      pipeline: { enabled: false, workspaceIds: [], turnLimit: 500 },
    });
  });

  it('cờ SHOPIFY_ENABLED mặc định TẮT; chỉ đúng chữ "true" mới bật; đọc SHOPIFY_API_VERSION', () => {
    const shopify = (value?: string, apiVersion?: string) =>
      loadConfig({ DATABASE_WORKER_URL, SHOPIFY_ENABLED: value, SHOPIFY_API_VERSION: apiVersion })
        .shopify;
    expect(shopify()).toEqual({ enabled: false, apiVersion: undefined });
    expect(shopify('1').enabled).toBe(false);
    expect(shopify('true', ' 2026-01 ')).toEqual({ enabled: true, apiVersion: '2026-01' });
  });

  it('FR-094 cờ WORKSPACE_DELETE_ENABLED mặc định TẮT; chỉ đúng chữ "true" mới bật', () => {
    const flag = (value?: string) =>
      loadConfig({ DATABASE_WORKER_URL, WORKSPACE_DELETE_ENABLED: value }).workspaceDeleteEnabled;
    expect(flag()).toBe(false);
    expect(flag('1')).toBe(false);
    expect(flag('')).toBe(false);
    expect(flag('true')).toBe(true);
  });

  it('FR-023 cờ POLLING_ENABLED mặc định TẮT; chỉ đúng chữ "true" mới bật (như FB_OAUTH_ENABLED)', () => {
    expect(loadConfig({ DATABASE_WORKER_URL, POLLING_ENABLED: '' }).pollingEnabled).toBe(false);
    expect(loadConfig({ DATABASE_WORKER_URL, POLLING_ENABLED: '1' }).pollingEnabled).toBe(false);
    expect(loadConfig({ DATABASE_WORKER_URL }).pollingEnabled).toBe(false);
    expect(loadConfig({ DATABASE_WORKER_URL, POLLING_ENABLED: 'false' }).pollingEnabled).toBe(
      false,
    );
    expect(
      loadConfig({
        DATABASE_WORKER_URL,
        POLLING_ENABLED: 'true',
        META_APP_ID: '1',
        META_APP_SECRET: 's',
      }),
    ).toMatchObject({ pollingEnabled: true, metaAppId: '1', metaAppSecret: 's' });
  });

  it('FR-023 bật POLLING_ENABLED mà thiếu META_APP_ID/META_APP_SECRET → CONFIG_INVALID (không lộ giá trị)', () => {
    expect(() => loadConfig({ DATABASE_WORKER_URL, POLLING_ENABLED: 'true' })).toThrow(
      /META_APP_ID/,
    );
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

  describe('FR-016 loadConfig FB_CONNECTOR_ENABLED (FB-CONNECTOR-REGISTER)', () => {
    const META_APP_ID = '123456789012345';
    const META_APP_SECRET = 'bi-mat-app-gia-0123456789abcdef';
    const TOKEN_ENC_KEYS = `v1:${'a'.repeat(64)}`;
    const full = { DATABASE_WORKER_URL, META_APP_ID, META_APP_SECRET, TOKEN_ENC_KEYS };

    it('mặc định TẮT; chỉ đúng chữ `true` mới bật (TRUE/1/yes/rỗng vẫn tắt) và khi tắt không đọc META_*', () => {
      for (const flag of [undefined, '', 'false', '1', 'yes', 'TRUE', 'True']) {
        expect(
          loadConfig({ DATABASE_WORKER_URL, FB_CONNECTOR_ENABLED: flag, META_APP_ID: 'sai' })
            .facebook,
        ).toEqual({ enabled: false });
      }
    });

    it('bật đủ cấu hình → trả appId/appSecret (cắt khoảng trắng)', () => {
      expect(
        loadConfig({ ...full, FB_CONNECTOR_ENABLED: ' true ', META_APP_ID: ` ${META_APP_ID} ` })
          .facebook,
      ).toEqual({ enabled: true, appId: META_APP_ID, appSecret: META_APP_SECRET });
    });

    it('bật mà thiếu/sai biến → CONFIG_INVALID nêu tên biến, không lộ giá trị', () => {
      const cases: Array<[string, Record<string, string | undefined>]> = [
        ['META_APP_ID', { META_APP_ID: undefined }],
        ['META_APP_ID', { META_APP_ID: 'khong-phai-so-bimat' }],
        ['META_APP_SECRET', { META_APP_SECRET: 'ngan' }],
        ['TOKEN_ENC_KEYS', { TOKEN_ENC_KEYS: ' ' }],
      ];
      for (const [name, override] of cases) {
        try {
          loadConfig({ ...full, FB_CONNECTOR_ENABLED: 'true', ...override });
          expect.unreachable(name);
        } catch (error) {
          expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
          expect((error as Error).message).toContain(name);
          expect((error as Error).message).not.toContain(META_APP_SECRET);
          expect((error as Error).message).not.toContain('bimat');
        }
      }
    });
  });

  describe('FR-014 loadConfig MESSENGER_CONNECTOR_ENABLED (MESSENGER-WEBHOOK)', () => {
    const full = {
      DATABASE_WORKER_URL,
      META_APP_ID: '123456789012345',
      META_APP_SECRET: 'bi-mat-app-gia-0123456789abcdef',
      TOKEN_ENC_KEYS: `v1:${'a'.repeat(64)}`,
    };

    it('mặc định TẮT; chỉ đúng chữ `true` mới bật; độc lập với cờ Facebook/Instagram', () => {
      for (const flag of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
        expect(
          loadConfig({ DATABASE_WORKER_URL, MESSENGER_CONNECTOR_ENABLED: flag }).messenger,
        ).toEqual({ enabled: false });
      }
      const cfg = loadConfig({ ...full, MESSENGER_CONNECTOR_ENABLED: 'true' });
      expect(cfg.messenger).toEqual({
        enabled: true,
        appId: full.META_APP_ID,
        appSecret: full.META_APP_SECRET,
      });
      expect(cfg.facebook).toEqual({ enabled: false });
      expect(cfg.instagram).toEqual({ enabled: false });
    });

    it('bật mà thiếu biến → CONFIG_INVALID, không lộ bí mật', () => {
      try {
        loadConfig({ ...full, MESSENGER_CONNECTOR_ENABLED: 'true', META_APP_ID: undefined });
        expect.unreachable();
      } catch (error) {
        expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
        expect((error as Error).message).not.toContain(full.META_APP_SECRET);
      }
    });
  });

  describe('FR-015 loadConfig TIKTOK_CONNECTOR_ENABLED (TIKTOK-CONNECTOR)', () => {
    // Dựng lúc chạy (≥ 16 ký tự theo schema) để file không chứa literal giống khóa.
    const TIKTOK_CLIENT_SECRET = 'tt-test'.repeat(3);
    const TOKEN_ENC_KEYS = `v1:${'a'.repeat(64)}`;
    const full = { DATABASE_WORKER_URL, TIKTOK_CLIENT_SECRET, TOKEN_ENC_KEYS };

    it('mặc định TẮT; chỉ đúng chữ `true` mới bật; độc lập với cờ Meta', () => {
      for (const flag of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
        expect(loadConfig({ ...full, TIKTOK_CONNECTOR_ENABLED: flag }).tiktok).toEqual({
          enabled: false,
        });
      }
      const cfg = loadConfig({ ...full, TIKTOK_CONNECTOR_ENABLED: 'true' });
      expect(cfg.tiktok).toEqual({ enabled: true, clientSecret: TIKTOK_CLIENT_SECRET });
      expect(cfg.facebook).toEqual({ enabled: false });
    });

    it('bật mà thiếu/ngắn biến → CONFIG_INVALID, không lộ bí mật', () => {
      for (const override of [
        { TIKTOK_CLIENT_SECRET: undefined },
        { TIKTOK_CLIENT_SECRET: 'ngan' },
        { TOKEN_ENC_KEYS: ' ' },
      ]) {
        try {
          loadConfig({ ...full, TIKTOK_CONNECTOR_ENABLED: 'true', ...override });
          expect.unreachable();
        } catch (error) {
          expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
          expect((error as Error).message).not.toContain(TIKTOK_CLIENT_SECRET);
        }
      }
    });
  });

  describe('FR-013 loadConfig IG_CONNECTOR_ENABLED (IG-CONNECTOR)', () => {
    const META_APP_ID = '123456789012345';
    const META_APP_SECRET = 'bi-mat-app-gia-0123456789abcdef';
    const TOKEN_ENC_KEYS = `v1:${'a'.repeat(64)}`;
    const full = { DATABASE_WORKER_URL, META_APP_ID, META_APP_SECRET, TOKEN_ENC_KEYS };

    it('mặc định TẮT; chỉ đúng chữ `true` mới bật; độc lập với cờ Facebook', () => {
      for (const flag of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
        expect(loadConfig({ DATABASE_WORKER_URL, IG_CONNECTOR_ENABLED: flag }).instagram).toEqual({
          enabled: false,
        });
      }
      const cfg = loadConfig({ ...full, IG_CONNECTOR_ENABLED: 'true' });
      expect(cfg.instagram).toEqual({
        enabled: true,
        appId: META_APP_ID,
        appSecret: META_APP_SECRET,
      });
      expect(cfg.facebook).toEqual({ enabled: false });
    });

    it('bật mà thiếu biến → CONFIG_INVALID, không lộ bí mật', () => {
      for (const override of [{ META_APP_ID: undefined }, { TOKEN_ENC_KEYS: ' ' }]) {
        try {
          loadConfig({ ...full, IG_CONNECTOR_ENABLED: 'true', ...override });
          expect.unreachable();
        } catch (error) {
          expect(isAppError(error) && error.code).toBe('CONFIG_INVALID');
          expect((error as Error).message).not.toContain(META_APP_SECRET);
        }
      }
    });
  });
});

describe('PIPE-ORCHESTRATOR — cấu hình pipeline', () => {
  const base = { DATABASE_WORKER_URL };
  it('mặc định TẮT, danh sách rỗng, hạn mức mặc định', () => {
    const c = loadConfig(base);
    expect(c.pipeline.enabled).toBe(false);
    expect(c.pipeline.workspaceIds).toEqual([]);
    expect(c.pipeline.turnLimit).toBeGreaterThan(0);
  });
  it('chỉ đúng chữ true mới bật; danh sách chỉ giữ UUID hợp lệ', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const on = loadConfig({
      ...base,
      PIPELINE_ENABLED: 'true',
      PIPELINE_WORKSPACE_IDS: `${id}, bad`,
    });
    expect(on.pipeline.enabled).toBe(true);
    expect(on.pipeline.workspaceIds).toEqual([id]);
    expect(loadConfig({ ...base, PIPELINE_ENABLED: 'yes' }).pipeline.enabled).toBe(false);
  });
});

describe('FR-133 cấu hình embedding duy nhất của worker', () => {
  const base = { DATABASE_WORKER_URL };
  it('tắt cờ → off (KHÔNG mock); bật cờ + ML_URL → bge-m3 (cùng model với web/EVAL gọi cùng hàm)', async () => {
    const { ML_EMBEDDING_MODEL, resolveEmbeddingConfig } = await import('@flow/ai');
    const off = loadConfig(base).embedding;
    expect(off.kind).toBe('off');
    expect(off.embedder).toBeNull();
    const env = { ...base, ML_EMBED_ENABLED: 'true', ML_URL: 'http://ml:8000' };
    expect(loadConfig(env).embedding.model).toBe(ML_EMBEDDING_MODEL);
    expect(loadConfig(env).embedding.model).toBe(resolveEmbeddingConfig(env).model);
    expect(loadConfig({ ...base, ML_EMBED_ENABLED: '1', ML_URL: 'http://ml' }).embedding.kind).toBe(
      'off',
    );
  });
});
