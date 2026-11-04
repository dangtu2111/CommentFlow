import { assertTokenKeysCoverVersions } from '@flow/connectors';
import { type FlowDb, listChannelKeyVersions } from '@flow/db';

/**
 * Lúc khởi động: mọi `key_version` đang có token trong `channels` phải có khóa trong `TOKEN_ENC_KEYS`, nếu không
 * dừng khởi động (lỗi cấu hình rõ ràng, không đụng kênh nào). Thông báo chỉ nêu số phiên bản, không in khóa.
 */
export async function verifyTokenKeysAtStartup(
  db: FlowDb,
  rawKeys: string | undefined,
): Promise<void> {
  const versionsInUse = await db.withSystem((tx) => listChannelKeyVersions(tx));
  assertTokenKeysCoverVersions({ rawKeys, versionsInUse });
}
