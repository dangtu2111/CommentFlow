import { type ChannelRef, createChannelTokenProvider, type TokenCipher } from '@flow/connectors';
import { eq, type FlowDb, readChannelToken, schema } from '@flow/db';

/**
 * `TokenProvider` của worker (đường duy nhất giải mã token Page): đọc ciphertext bằng `withJob` (chỉ đường hệ thống
 * được đọc, ADR 007 §2) rồi giải mã bằng khóa trong env. Không giải mã được (thiếu/sai khóa/sai AAD/hỏng) → kênh chuyển
 * `expired` ("cần kết nối lại") và connector nhận `TOKEN_EXPIRED`. Không log token/ciphertext.
 */
export function createWorkerTokenProvider(options: {
  db: FlowDb;
  cipher: TokenCipher;
  onWarn?: (event: { event: 'channel_mark_expired_failed'; channelId: string }) => void;
}) {
  const { db, cipher, onWarn } = options;
  return createChannelTokenProvider({
    cipher,
    ...(onWarn ? { onWarn } : {}),
    reader: {
      read: (channel: ChannelRef) =>
        db.withJob(channel.workspaceId, (tx) => readChannelToken(tx, channel.id)),
    },
    onUndecryptable: (channel: ChannelRef) =>
      db.withJob(channel.workspaceId, async (tx) => {
        await tx
          .update(schema.channels)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(schema.channels.id, channel.id));
      }),
  });
}
