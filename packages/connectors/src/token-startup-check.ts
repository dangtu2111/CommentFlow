import { parseTokenKeys, TokenConfigError } from './token-cipher';

/**
 * Kiểm lúc khởi động (web/worker): mọi `key_version` đang có trong `channels` phải có khóa trong `TOKEN_ENC_KEYS`.
 * Chưa có kênh nào và chưa đặt khóa → qua (chưa cần). Khóa đã đặt mà sai định dạng → luôn báo. Thông báo chỉ nêu số
 * phiên bản, không bao giờ in khóa.
 */
export function assertTokenKeysCoverVersions(input: {
  rawKeys: string | undefined;
  versionsInUse: readonly number[];
}): void {
  const hasKeys = input.rawKeys !== undefined && input.rawKeys.trim() !== '';
  if (!hasKeys && input.versionsInUse.length === 0) return;
  const { keys } = parseTokenKeys(input.rawKeys);
  const missing = [...new Set(input.versionsInUse)]
    .filter((v) => !keys.has(v))
    .sort((a, b) => a - b);
  if (missing.length > 0) {
    throw new TokenConfigError(
      `TOKEN_ENC_KEYS thiếu khóa cho phiên bản đang dùng trong channels: ${missing.map((v) => `v${v}`).join(', ')}.`,
    );
  }
}
