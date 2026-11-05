import { describe, expect, it } from 'vitest';
import type { FbOAuthConfig } from './fb-oauth-env';
import { verifyWebTokenKeysAtStartup } from './token-keys-startup';

const KEY = (n: string) => n.repeat(64);
const on = (tokenEncKeys: string): FbOAuthConfig => ({
  enabled: true,
  appId: '1234567890',
  appSecret: 'x'.repeat(32),
  redirectUri: 'https://app.example.test/cb',
  loginConfigId: undefined,
  tokenEncKeys,
  channelsLimit: 1,
});

describe('verifyWebTokenKeysAtStartup', () => {
  it('cờ tắt → không kiểm, không đọc DB', async () => {
    let called = false;
    await verifyWebTokenKeysAtStartup({ enabled: false }, async () => {
      called = true;
      return [9];
    });
    expect(called).toBe(false);
  });

  it('đủ khóa cho mọi phiên bản đang dùng → qua', async () => {
    await expect(
      verifyWebTokenKeysAtStartup(on(`v1:${KEY('a')},v2:${KEY('b')}`), async () => [1, 2]),
    ).resolves.toBeUndefined();
    await expect(
      verifyWebTokenKeysAtStartup(on(`v1:${KEY('a')}`), async () => []),
    ).resolves.toBeUndefined();
  });

  it('thiếu khóa cho phiên bản đang dùng → dừng, nêu số phiên bản, không in khóa', async () => {
    const promise = verifyWebTokenKeysAtStartup(on(`v2:${KEY('b')}`), async () => [1, 2]);
    await expect(promise).rejects.toThrow(/v1/);
    await promise.catch((e: Error) => expect(e.message).not.toContain(KEY('b')));
  });

  it('khóa sai định dạng → dừng', async () => {
    await expect(verifyWebTokenKeysAtStartup(on('v1:short'), async () => [])).rejects.toThrow();
  });
});
