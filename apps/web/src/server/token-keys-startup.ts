import { assertTokenKeysCoverVersions, parseTokenKeys } from '@flow/connectors';
import type { FbOAuthConfig } from './fb-oauth-env';

/**
 * TOKEN-KEY-STARTUP-WEB: khi kết nối Facebook BẬT (web bắt đầu mã hóa token), web phải dừng khởi động nếu
 * `TOKEN_ENC_KEYS` sai định dạng hoặc thiếu khóa cho một `key_version` đang có trong `channels` — lỗi cấu hình rõ ràng
 * thay vì để kênh hỏng về sau. Thông báo chỉ nêu số phiên bản, không in khóa. Cờ tắt → không kiểm (web không đụng
 * token). Thuần: danh sách phiên bản đang dùng do nơi gọi đọc (`listChannelKeyVersions`).
 */
export async function verifyWebTokenKeysAtStartup(
  config: FbOAuthConfig,
  listVersionsInUse: () => Promise<number[]>,
): Promise<void> {
  if (!config.enabled) return;
  parseTokenKeys(config.tokenEncKeys); // sai định dạng → TokenConfigError
  assertTokenKeysCoverVersions({
    rawKeys: config.tokenEncKeys,
    versionsInUse: await listVersionsInUse(),
  });
}
