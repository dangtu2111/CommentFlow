import {
  type ConnectorRegistry,
  createConnectorRegistry,
  createFacebookConnector,
  createInstagramConnector,
  createTokenCipher,
  parseTokenKeys,
} from '@flow/connectors';
import type { FlowDb } from '@flow/db';
import type { FacebookConnectorConfig, InstagramConnectorConfig } from '../config';
import type { Logger } from '../logger';
import { createWorkerTokenProvider } from './token-provider';

/**
 * Sổ connector của worker (FB-CONNECTOR-REGISTER, IG-CONNECTOR). Cả hai cờ (`FB_CONNECTOR_ENABLED`, `IG_CONNECTOR_ENABLED`)
 * tắt → RỖNG (lệnh gửi/ẩn ghi `connector_unavailable`, không gọi Meta). Cờ nào bật thì thêm connector đó, token Page giải mã qua
 * `createWorkerTokenProvider`. Khóa mã hóa sai/thiếu → ném (worker không khởi động). Dựng không gọi mạng/DB; thông báo lỗi
 * không kèm khóa/bí mật.
 */
export function buildConnectorRegistry(options: {
  db: FlowDb;
  facebook: FacebookConnectorConfig;
  instagram: InstagramConnectorConfig;
  tokenEncKeys: string | undefined;
  logger: Pick<Logger, 'warn'>;
}): ConnectorRegistry {
  const { db, facebook, instagram, tokenEncKeys, logger } = options;
  if (!facebook.enabled && !instagram.enabled) return createConnectorRegistry([]);
  const cipher = createTokenCipher(parseTokenKeys(tokenEncKeys));
  const tokenProvider = createWorkerTokenProvider({
    db,
    cipher,
    onWarn: (event) => logger.warn(event, 'không đánh dấu được kênh hết hạn'),
  });
  return createConnectorRegistry([
    ...(facebook.enabled
      ? [
          createFacebookConnector({
            tokenProvider,
            appId: facebook.appId,
            appSecret: facebook.appSecret,
          }),
        ]
      : []),
    ...(instagram.enabled
      ? [
          createInstagramConnector({
            tokenProvider,
            appId: instagram.appId,
            appSecret: instagram.appSecret,
          }),
        ]
      : []),
  ]);
}
