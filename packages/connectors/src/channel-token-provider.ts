import { PlatformError } from './errors';
import { type TokenCipher, TokenDecryptError } from './token-cipher';
import type { ChannelRef, TokenProvider } from './types';

/** Ciphertext đọc từ DB (hàm DEFINER chỉ hệ thống) — worker tiêm bản đọc qua `withJob`. */
export type StoredChannelToken = { ciphertext: Buffer; keyVersion: number };

export interface ChannelTokenReader {
  /** `null` = kênh chưa có token (chưa kết nối hoặc đã ngắt). Lỗi hạ tầng (DB) cứ ném nguyên dạng. */
  read(channel: ChannelRef): Promise<StoredChannelToken | null>;
}

export type ChannelTokenProviderOptions = {
  cipher: TokenCipher;
  reader: ChannelTokenReader;
  /** Gọi khi không dùng được token (thiếu/sai khóa/sai AAD/hỏng): đặt kênh sang "cần kết nối lại" (`expired`). */
  onUndecryptable?: (channel: ChannelRef) => Promise<void> | void;
  /** Ghi sự kiện KHÔNG chứa PII/token (chỉ tên sự kiện + id kênh). */
  onWarn?: (event: { event: 'channel_mark_expired_failed'; channelId: string }) => void;
};

/**
 * `TokenProvider` thật: đọc ciphertext qua reader được tiêm rồi giải mã. Mọi ca không dùng được token đều ra
 * `PlatformError('TOKEN_EXPIRED')` KHÔNG kèm `cause` — không token, ciphertext, khóa nào lọt vào thông báo/log.
 */
export function createChannelTokenProvider(options: ChannelTokenProviderOptions): TokenProvider {
  const { cipher, reader, onUndecryptable, onWarn } = options;

  async function markUnusable(channel: ChannelRef): Promise<never> {
    try {
      await onUndecryptable?.(channel);
    } catch {
      // Không che TOKEN_EXPIRED bằng lỗi của hook (và không log nội dung lỗi gốc).
      onWarn?.({ event: 'channel_mark_expired_failed', channelId: channel.id });
    }
    throw new PlatformError('TOKEN_EXPIRED', { message: 'Token của kênh không còn dùng được.' });
  }

  return {
    async getAccessToken(channel) {
      const stored = await reader.read(channel);
      if (stored === null) return markUnusable(channel);
      try {
        return cipher.decrypt(stored.ciphertext, stored.keyVersion, {
          workspaceId: channel.workspaceId,
          channelId: channel.id,
        });
      } catch (error) {
        if (error instanceof TokenDecryptError) return markUnusable(channel);
        throw error;
      }
    },
  };
}
