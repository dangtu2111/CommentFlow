import { AppError } from '@flow/shared';
import type { ConnectorCapabilities } from './capabilities';
import { DECLARED_CAPABILITIES } from './declarations';
import type { Platform, PlatformConnector } from './types';

/**
 * Sổ đăng ký connector theo nền tảng. Mỗi nền tảng đúng một connector; pipeline lấy connector và đọc khai báo ở đây
 * thay vì viết cứng luật từng nền tảng (FR-016).
 */
export function createConnectorRegistry(connectors: PlatformConnector[]) {
  const byPlatform = new Map<Platform, PlatformConnector>();
  for (const connector of connectors) {
    if (byPlatform.has(connector.platform)) {
      throw new AppError('CONFLICT', `Đã có connector cho nền tảng ${connector.platform}.`);
    }
    byPlatform.set(connector.platform, connector);
  }

  return {
    has: (platform: Platform): boolean => byPlatform.has(platform),
    get(platform: Platform): PlatformConnector {
      const connector = byPlatform.get(platform);
      if (!connector)
        throw new AppError('NOT_FOUND', `Chưa đăng ký connector cho nền tảng ${platform}.`);
      return connector;
    },
    platforms: (): Platform[] => [...byPlatform.keys()],
    /** Khai báo của connector đã đăng ký; chưa có connector thì dùng khai báo mặc định (UI vẫn biết nút nào phải ẩn). */
    capabilitiesOf: (platform: Platform): ConnectorCapabilities =>
      byPlatform.get(platform)?.capabilities ?? DECLARED_CAPABILITIES[platform],
  };
}

export type ConnectorRegistry = ReturnType<typeof createConnectorRegistry>;
