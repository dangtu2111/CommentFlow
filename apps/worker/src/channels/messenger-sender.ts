import {
  createMessengerSender,
  createTokenCipher,
  type MessengerSender,
  parseTokenKeys,
} from '@flow/connectors';
import type { FlowDb } from '@flow/db';
import type { MessengerConnectorConfig } from '../config';
import type { Logger } from '../logger';
import { createWorkerTokenProvider } from './token-provider';

/**
 * Bộ gửi tin Messenger của worker (MESSENGER-WEBHOOK, FR-014). Cờ `MESSENGER_CONNECTOR_ENABLED` tắt → `null` (không
 * dựng, không đọc khóa). Bật → token Page giải mã qua `createWorkerTokenProvider`; khóa mã hóa sai/thiếu → ném. Chưa có
 * job gửi tin dùng nó (cần bảng hội thoại — `MESSENGER-INGEST`, `MSG-INBOX`). Dựng không gọi mạng/DB.
 */
export function buildMessengerSender(options: {
  db: FlowDb;
  messenger: MessengerConnectorConfig;
  tokenEncKeys: string | undefined;
  logger: Pick<Logger, 'warn'>;
}): MessengerSender | null {
  const { db, messenger, tokenEncKeys, logger } = options;
  if (!messenger.enabled) return null;
  const tokenProvider = createWorkerTokenProvider({
    db,
    cipher: createTokenCipher(parseTokenKeys(tokenEncKeys)),
    onWarn: (event) => logger.warn(event, 'không đánh dấu được kênh hết hạn'),
  });
  return createMessengerSender({ tokenProvider, appSecret: messenger.appSecret });
}
