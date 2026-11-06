import {
  type ConnectorRegistry,
  createConnectorRegistry,
  createFacebookConnector,
  createTokenCipher,
  parseTokenKeys,
} from '@flow/connectors';
import type { FlowDb } from '@flow/db';
import type { FacebookConnectorConfig } from '../config';
import type { Logger } from '../logger';
import { createWorkerTokenProvider } from './token-provider';

/**
 * Sổ connector của worker (FB-CONNECTOR-REGISTER). Cờ tắt → RỖNG (lệnh gửi/ẩn ghi `connector_unavailable`, không gọi Meta).
 * Cờ bật → `createFacebookConnector` với token Page giải mã qua `createWorkerTokenProvider`. Khóa mã hóa sai/thiếu → ném
 * (worker không khởi động). Dựng không gọi mạng/DB; thông báo lỗi không kèm khóa/bí mật.
 */
export function buildConnectorRegistry(options: {
  db: FlowDb;
  facebook: FacebookConnectorConfig;
  tokenEncKeys: string | undefined;
  logger: Pick<Logger, 'warn'>;
}): ConnectorRegistry {
  const { db, facebook, tokenEncKeys, logger } = options;
  if (!facebook.enabled) return createConnectorRegistry([]);
  const cipher = createTokenCipher(parseTokenKeys(tokenEncKeys));
  const tokenProvider = createWorkerTokenProvider({
    db,
    cipher,
    onWarn: (event) => logger.warn(event, 'không đánh dấu được kênh hết hạn'),
  });
  return createConnectorRegistry([
    createFacebookConnector({
      tokenProvider,
      appId: facebook.appId,
      appSecret: facebook.appSecret,
    }),
  ]);
}
