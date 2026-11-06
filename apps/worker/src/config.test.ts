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
      pollingEnabled: false,
      metaAppId: undefined,
      metaAppSecret: undefined,
      facebook: { enabled: false },
      workspaceDeleteEnabled: false,
    });
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
});
