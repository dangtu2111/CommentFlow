import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createChannelTokenProvider } from './channel-token-provider';
import { isPlatformError } from './errors';
import { createTokenCipher, parseTokenKeys } from './token-cipher';
import type { ChannelRef } from './types';

const hex = () => randomBytes(32).toString('hex');
const channel: ChannelRef = {
  id: '22222222-2222-4222-8222-222222222222',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  platform: 'facebook',
  externalId: 'page-1',
};
const ctx = { workspaceId: channel.workspaceId, channelId: channel.id };
const cipherOf = (spec: string) => createTokenCipher(parseTokenKeys(spec));

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('FR-010 ChannelTokenProvider — lấy token đã giải mã cho connector', () => {
  it('FR-010 đọc ciphertext qua reader được tiêm và trả đúng token', async () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const stored = cipher.encrypt('EAAG-token-that', ctx);
    const provider = createChannelTokenProvider({ cipher, reader: { read: async () => stored } });
    expect(await provider.getAccessToken(channel)).toBe('EAAG-token-that');
  });

  it('FR-010 kênh chưa có token → onUndecryptable một lần rồi TOKEN_EXPIRED', async () => {
    const onUndecryptable = vi.fn();
    const provider = createChannelTokenProvider({
      cipher: cipherOf(`v1:${hex()}`),
      reader: { read: async () => null },
      onUndecryptable,
    });
    const error = await caught(provider.getAccessToken(channel));
    expect(isPlatformError(error) && error.code).toBe('TOKEN_EXPIRED');
    expect(onUndecryptable).toHaveBeenCalledTimes(1);
    expect(onUndecryptable).toHaveBeenCalledWith(channel);
  });

  it('FR-010 sai khóa / sai kênh (AAD) / ciphertext hỏng → kênh cần kết nối lại, TOKEN_EXPIRED, KHÔNG lộ token/ciphertext/khóa', async () => {
    const k = hex();
    const stored = cipherOf(`v1:${k}`).encrypt('token-bi-mat-xyz', ctx);
    const wrongChannel: ChannelRef = { ...channel, id: '99999999-9999-4999-8999-999999999999' };
    const cases: Array<[string, ChannelRef, Buffer]> = [
      ['sai khóa', channel, stored.ciphertext],
      ['sai kênh', wrongChannel, stored.ciphertext],
      ['ciphertext hỏng', channel, Buffer.from(stored.ciphertext).fill(7)],
    ];
    for (const [label, ch, ciphertext] of cases) {
      const onUndecryptable = vi.fn();
      const wrongKey = label === 'sai khóa' ? hex() : k;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const provider = createChannelTokenProvider({
        cipher: cipherOf(`v1:${wrongKey}`),
        reader: { read: async () => ({ ciphertext, keyVersion: 1 }) },
        onUndecryptable,
      });
      const error = await caught(provider.getAccessToken(ch));
      expect(isPlatformError(error) && error.code, label).toBe('TOKEN_EXPIRED');
      expect(onUndecryptable, label).toHaveBeenCalledTimes(1);
      const dump = JSON.stringify({
        message: (error as Error).message,
        cause: String((error as Error).cause ?? ''),
        log: [...warn.mock.calls, ...err.mock.calls],
      });
      for (const secret of [
        'token-bi-mat-xyz',
        k,
        ciphertext.toString('hex'),
        ciphertext.toString('base64'),
      ]) {
        expect(dump, label).not.toContain(secret);
      }
      warn.mockRestore();
      err.mockRestore();
    }
  });

  it('FR-010 hook đánh dấu kênh lỗi cũng KHÔNG che TOKEN_EXPIRED và không lộ dữ liệu (ghi sự kiện không PII)', async () => {
    const onWarn = vi.fn();
    const provider = createChannelTokenProvider({
      cipher: cipherOf(`v1:${hex()}`),
      reader: { read: async () => null },
      onUndecryptable: async () => {
        throw new Error('DB sập');
      },
      onWarn,
    });
    const error = await caught(provider.getAccessToken(channel));
    expect(isPlatformError(error) && error.code).toBe('TOKEN_EXPIRED');
    expect(onWarn).toHaveBeenCalledWith({
      event: 'channel_mark_expired_failed',
      channelId: channel.id,
    });
  });

  it('FR-010 lỗi của reader (DB) không phải lỗi token → nổi lên nguyên dạng, không đánh dấu kênh hỏng', async () => {
    const onUndecryptable = vi.fn();
    const boom = new Error('mất kết nối DB');
    const provider = createChannelTokenProvider({
      cipher: cipherOf(`v1:${hex()}`),
      reader: {
        read: async () => {
          throw boom;
        },
      },
      onUndecryptable,
    });
    expect(await caught(provider.getAccessToken(channel))).toBe(boom);
    expect(onUndecryptable).not.toHaveBeenCalled();
  });

  it('FR-010 lỗi bất ngờ của cipher (không phải lỗi giải mã) nổi lên nguyên dạng, không đánh dấu kênh hỏng', async () => {
    const boom = new Error('lỗi lạ');
    const onUndecryptable = vi.fn();
    const provider = createChannelTokenProvider({
      cipher: {
        currentVersion: 1,
        encrypt: () => {
          throw boom;
        },
        decrypt: () => {
          throw boom;
        },
        reencrypt: () => {
          throw boom;
        },
      },
      reader: { read: async () => ({ ciphertext: Buffer.alloc(40), keyVersion: 1 }) },
      onUndecryptable,
    });
    expect(await caught(provider.getAccessToken(channel))).toBe(boom);
    expect(onUndecryptable).not.toHaveBeenCalled();
  });
});
