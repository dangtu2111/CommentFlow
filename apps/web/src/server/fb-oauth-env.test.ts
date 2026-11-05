import { describe, expect, it } from 'vitest';
import { loadFbOAuthConfig } from './fb-oauth-env';

const FULL = {
  FB_OAUTH_ENABLED: 'true',
  META_APP_ID: '1234567890',
  META_APP_SECRET: 'x'.repeat(32),
  META_OAUTH_REDIRECT_URL: 'https://app.example.test/api/channels/facebook/callback',
  TOKEN_ENC_KEYS: `v1:${'a'.repeat(64)}`,
};

describe('loadFbOAuthConfig', () => {
  it('mặc định TẮT; biến khác không được đọc', () => {
    expect(loadFbOAuthConfig({})).toEqual({ enabled: false });
    expect(loadFbOAuthConfig({ ...FULL, FB_OAUTH_ENABLED: undefined })).toEqual({ enabled: false });
    for (const v of ['', 'TRUE', '1', 'yes', 'false'])
      expect(loadFbOAuthConfig({ ...FULL, FB_OAUTH_ENABLED: v })).toEqual({ enabled: false });
  });

  it('bật + đủ biến → cấu hình, giới hạn mặc định 1', () => {
    const c = loadFbOAuthConfig(FULL);
    expect(c).toMatchObject({ enabled: true, appId: '1234567890', channelsLimit: 1 });
    expect(loadFbOAuthConfig({ ...FULL, CHANNELS_LIMIT_DEFAULT: '5' })).toMatchObject({
      channelsLimit: 5,
    });
  });

  it('bật mà thiếu/sai biến → lỗi nêu tên biến, không lộ giá trị', () => {
    for (const name of [
      'META_APP_ID',
      'META_APP_SECRET',
      'META_OAUTH_REDIRECT_URL',
      'TOKEN_ENC_KEYS',
    ]) {
      expect(() => loadFbOAuthConfig({ ...FULL, [name]: undefined })).toThrow(name);
    }
    expect(() => loadFbOAuthConfig({ ...FULL, META_APP_SECRET: 'short' })).toThrow(
      /META_APP_SECRET/,
    );
    try {
      loadFbOAuthConfig({ ...FULL, META_APP_SECRET: 'short-secret' });
    } catch (e) {
      expect(String(e)).not.toContain('short-secret');
    }
  });
});
